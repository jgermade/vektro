//! Generación del documento SVG a partir de las regiones ya ajustadas.
//!
//! Todas las regiones de un color van dentro de un `<g fill="…">`, y cada una es
//! un `<path>`. Así el documento se puede editar bloque a bloque en un editor
//! vectorial en vez de tener una sola figura por color repartida por todo el
//! dibujo.

use crate::fit::{Fit, Fitted};
use crate::region::{Axis, Regions};

pub struct Options {
    /// Tamaño de render de cada píxel lógico. El `viewBox` va siempre en píxeles
    /// del dibujo (1 unidad = 1 píxel); esto sólo fija `width`/`height`.
    pub pixel_size: u32,
    /// `width`/`height` del documento, cuando no son el lienzo por `pixel_size`.
    ///
    /// Lo usa la escala de trabajo: ahí el lienzo está en píxeles de trabajo —una
    /// unidad del `viewBox` es uno de ellos, que es lo que hace que las
    /// coordenadas salgan tal como se trazaron— y el documento se anuncia al
    /// tamaño de la imagen que llegó, que es el que espera quien la trajo.
    pub display: Option<(usize, usize)>,
    /// Color de fondo opcional (se emite como rectángulo bajo los paths).
    pub background: Option<String>,
    pub fit: Fit,
    /// Superponer formas contenedoras como capas sólidas por debajo para eliminar grietas de renderizado.
    pub layering: bool,
}

pub struct Output {
    pub svg: String,
    pub colors: usize,
    /// Elementos `<path>` emitidos.
    pub paths: usize,
    /// Subtrazados, sumando los de todos los paths.
    pub subpaths: usize,
}

pub fn render(regions: &Regions, opts: &Options) -> Output {
    let (w, h) = (regions.width as i64, regions.height as i64);
    let scale = opts.pixel_size.max(1) as i64;

    // Se ajustan **todos** los tramos antes de ensamblar ningún anillo: una
    // frontera compartida se ajusta una sola vez y sus dos caras reciben lo
    // mismo. Ver [`crate::fit`], que es donde se explica por qué el orden no
    // puede ser el otro.
    let fitted = Fitted::new(regions, opts.fit);

    let mut total_paths = 0;
    let mut total_subpaths = 0;

    // Los degradados van los primeros, justo encima del fondo.
    let mut defs = String::new();
    let mut body = String::new();
    for (i, ramp) in regions.ramps.iter().enumerate() {
        total_paths += 1;
        total_subpaths += ramp.rings.len();
        let stops: String = ramp
            .stops
            .iter()
            .map(|&(at, color)| {
                format!(
                    "<stop offset=\"{}\" stop-color=\"{}\"/>",
                    trim_float(at),
                    color.to_hex()
                )
            })
            .collect();
        defs.push_str(&match ramp.axis {
            Axis::Linear { from, to } => format!(
                "    <linearGradient id=\"r{i}\" gradientUnits=\"userSpaceOnUse\" \
x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\">{stops}</linearGradient>\n",
                trim_float(from.0),
                trim_float(from.1),
                trim_float(to.0),
                trim_float(to.1),
            ),
            Axis::Radial { center, radius } => format!(
                "    <radialGradient id=\"r{i}\" gradientUnits=\"userSpaceOnUse\" \
cx=\"{}\" cy=\"{}\" r=\"{}\">{stops}</radialGradient>\n",
                trim_float(center.0),
                trim_float(center.1),
                trim_float(radius),
            ),
        });
        let d: String = ramp
            .rings
            .iter()
            .map(|ring| fitted.ring_data(ring))
            .collect();
        let rule = if ramp.rings.len() > 1 {
            " fill-rule=\"evenodd\""
        } else {
            ""
        };
        body.push_str(&format!("  <path fill=\"url(#r{i})\"{rule} d=\"{d}\"/>\n"));
    }

    let mut head = String::new();
    if !defs.is_empty() {
        head.push_str(&format!("  <defs>\n{defs}  </defs>\n"));
    }
    if let Some(bg) = &opts.background {
        head.push_str(&format!(
            "  <rect width=\"{w}\" height=\"{h}\" fill=\"{bg}\"/>\n"
        ));
    }
    body.insert_str(0, &head);

    let (reaches_transparent, depths) = if opts.layering {
        (
            find_transparent_regions(regions),
            compute_region_depths(regions),
        )
    } else {
        (Vec::new(), Vec::new())
    };

    let mut color_total_area = std::collections::HashMap::new();
    for r in &regions.regions {
        *color_total_area.entry(r.color).or_insert(0) += r.area;
    }

    let mut region_indices: Vec<usize> = (0..regions.regions.len()).collect();
    if opts.layering {
        region_indices.sort_by(|&a, &b| {
            depths[a]
                .cmp(&depths[b])
                .then_with(|| {
                    color_total_area[&regions.regions[b].color]
                        .cmp(&color_total_area[&regions.regions[a].color])
                })
                .then_with(|| regions.regions[b].area.cmp(&regions.regions[a].area))
        });
    }

    let mut i = 0;
    while i < region_indices.len() {
        let current_color = regions.regions[region_indices[i]].color;
        let current_depth = if opts.layering {
            depths[region_indices[i]]
        } else {
            0
        };
        let end = region_indices[i..]
            .iter()
            .position(|&idx| {
                regions.regions[idx].color != current_color
                    || (opts.layering && depths[idx] != current_depth)
            })
            .map_or(region_indices.len(), |n| i + n);

        let touches_transparent = opts.layering
            && region_indices[i..end]
                .iter()
                .any(|&idx| reaches_transparent[idx] || current_color.a < 255);

        let paths: Vec<String> = region_indices[i..end]
            .iter()
            .map(|&idx| {
                let region = &regions.regions[idx];
                let outer_idx = if opts.layering && region.rings.len() > 1 {
                    let mut max_area = -1.0;
                    let mut max_k = 0;
                    for (k, ring) in region.rings.iter().enumerate() {
                        let area = ring_area(ring, &regions.edges);
                        if area > max_area {
                            max_area = area;
                            max_k = k;
                        }
                    }
                    max_k
                } else {
                    0
                };

                let active_rings: Vec<&crate::region::Ring> = region
                    .rings
                    .iter()
                    .enumerate()
                    .filter_map(|(k, ring)| {
                        if !opts.layering || region.rings.len() <= 1 || k == outer_idx {
                            return Some(ring);
                        }
                        let mut touches_transparent = false;
                        for &(edge_id, reversed) in ring {
                            let edge = &regions.edges[edge_id];
                            let inside_id = if reversed { Some(edge.left) } else { edge.right };
                            match inside_id {
                                None => {
                                    touches_transparent = true;
                                    break;
                                }
                                Some(other_id) => {
                                    if other_id >= regions.regions.len()
                                        || regions.regions[other_id].color.a < 255
                                        || reaches_transparent[other_id]
                                    {
                                        touches_transparent = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if touches_transparent {
                            Some(ring)
                        } else {
                            None
                        }
                    })
                    .collect();

                total_subpaths += active_rings.len();
                let d: String = active_rings
                    .iter()
                    .map(|ring| fitted.ring_data(ring))
                    .collect();
                let rule = if active_rings.len() > 1 {
                    " fill-rule=\"evenodd\""
                } else {
                    ""
                };
                format!("{rule} d=\"{d}\"")
            })
            .collect();
        i = end;

        total_paths += paths.len();

        let mut fill = format!(" fill=\"{}\"", current_color.to_hex());
        if opts.layering && opts.fit.smooth() && !touches_transparent {
            fill.push_str(&format!(
                " stroke=\"{}\" stroke-width=\"1.5\" stroke-linejoin=\"round\" stroke-linecap=\"round\"",
                current_color.to_hex()
            ));
        }
        if current_color.a < 255 {
            fill.push_str(&format!(
                " fill-opacity=\"{}\"",
                trim_float(current_color.a as f64 / 255.0)
            ));
            if opts.layering {
                fill.push_str(&format!(
                    " stroke-opacity=\"{}\"",
                    trim_float(current_color.a as f64 / 255.0)
                ));
            }
        }

        if paths.len() == 1 {
            body.push_str(&format!("  <path{fill}{}/>\n", paths[0]));
        } else {
            body.push_str(&format!("  <g{fill}>\n"));
            for path in &paths {
                body.push_str(&format!("    <path{path}/>\n"));
            }
            body.push_str("  </g>\n");
        }
    }

    let rendering = if opts.fit.smooth() {
        ""
    } else {
        " shape-rendering=\"crispEdges\""
    };

    let (dw, dh) = opts
        .display
        .map_or((w * scale, h * scale), |(dw, dh)| (dw as i64, dh as i64));
    let svg = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{dw}\" height=\"{dh}\" \
viewBox=\"0 0 {w} {h}\"{rendering}>\n{body}</svg>\n",
    );

    Output {
        svg,
        colors: regions.colors,
        paths: total_paths,
        subpaths: total_subpaths,
    }
}

fn ring_area(ring: &crate::region::Ring, edges: &[crate::region::HalfEdge]) -> f64 {
    let points = crate::region::chain(ring, |e| edges[e].points.as_slice());
    if points.len() < 3 {
        return 0.0;
    }
    let mut area = 0.0;
    for i in 0..points.len() {
        let j = (i + 1) % points.len();
        area += f64::from(points[i].0) * f64::from(points[j].1);
        area -= f64::from(points[j].0) * f64::from(points[i].1);
    }
    (area / 2.0).abs()
}

fn ring_outer_index(rings: &[crate::region::Ring], edges: &[crate::region::HalfEdge]) -> usize {
    let mut max_area = -1.0;
    let mut outer_idx = 0;
    for (k, ring) in rings.iter().enumerate() {
        let area = ring_area(ring, edges);
        if area > max_area {
            max_area = area;
            outer_idx = k;
        }
    }
    outer_idx
}

fn find_transparent_regions(regions: &Regions) -> Vec<bool> {
    let mut reaches = vec![false; regions.regions.len()];
    for (id, r) in regions.regions.iter().enumerate() {
        if r.color.a < 255 {
            reaches[id] = true;
        }
    }

    let mut changed = true;
    while changed {
        changed = false;
        for (id, r) in regions.regions.iter().enumerate() {
            if reaches[id] || r.rings.len() <= 1 {
                continue;
            }
            let outer_idx = ring_outer_index(&r.rings, &regions.edges);
            for (k, ring) in r.rings.iter().enumerate() {
                if k == outer_idx {
                    continue;
                }
                for &(edge_id, reversed) in ring {
                    let edge = &regions.edges[edge_id];
                    let inside_id = if reversed { Some(edge.left) } else { edge.right };
                    match inside_id {
                        None => {
                            reaches[id] = true;
                            changed = true;
                            break;
                        }
                        Some(other_id) => {
                            if other_id >= regions.regions.len() || reaches[other_id] {
                                reaches[id] = true;
                                changed = true;
                                break;
                            }
                        }
                    }
                }
                if reaches[id] {
                    break;
                }
            }
        }
    }
    reaches
}

fn compute_region_depths(regions: &Regions) -> Vec<usize> {
    let mut depths = vec![0; regions.regions.len()];

    let mut changed = true;
    while changed {
        changed = false;
        for (i, region) in regions.regions.iter().enumerate() {
            if region.rings.len() <= 1 {
                continue;
            }
            let outer_idx = ring_outer_index(&region.rings, &regions.edges);
            let parent_depth = depths[i];
            for (k, ring) in region.rings.iter().enumerate() {
                if k == outer_idx {
                    continue;
                }
                for &(edge_id, reversed) in ring {
                    let edge = &regions.edges[edge_id];
                    let inside_id = if reversed { Some(edge.left) } else { edge.right };
                    if let Some(child_id) = inside_id {
                        if child_id < depths.len() && child_id != i && depths[child_id] <= parent_depth {
                            depths[child_id] = parent_depth + 1;
                            changed = true;
                        }
                    }
                }
            }
        }
    }
    depths
}

fn trim_float(v: f64) -> String {
    let s = format!("{:.3}", v);
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}
