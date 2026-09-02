//! Generación del documento SVG a partir de las regiones ya ajustadas.
//!
//! Todas las regiones de un color van dentro de un `<g fill="…">`, y cada una es
//! un `<path>`. Así el documento se puede editar bloque a bloque en un editor
//! vectorial en vez de tener una sola figura por color repartida por todo el
//! dibujo.
//!
//! Con [`Options::decoupage`] cada figura no se dibuja con su contorno sino con
//! el de su **cara**: ella misma más las vecinas que van por encima. Lo que se
//! ve no cambia —lo de arriba se pinta después y es opaco—, pero debajo del
//! borde antialiaseado de la pieza de arriba deja de haber lienzo vacío, y con
//! eso desaparece la costura de la frontera compartida. Ver [`faces()`].

use crate::fit::{Fit, Fitted};
use crate::region::{Axis, EdgeId, Moved, Regions, Ring};

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
    /// Recortar cada figura entera y meterla por debajo de lo que va encima, en
    /// vez de dejarlas pegadas por la frontera. Ver [`faces()`].
    pub decoupage: bool,
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

    // Con découpage cada figura se dibuja con los anillos de su cara —ella más
    // lo que se le pone encima— en vez de con los suyos. Se calcula una vez,
    // antes de emitir nada, porque el reparto depende del documento entero.
    let faces = opts.decoupage.then(|| faces(regions));

    let mut total_paths = 0;
    let mut total_subpaths = 0;

    // Los degradados van los primeros, justo encima del fondo.
    let mut defs = String::new();
    let mut body = String::new();
    for (i, ramp) in regions.ramps.iter().enumerate() {
        let rings = faces.as_ref().map_or(&ramp.rings, |f| &f.ramps[i]);
        total_paths += 1;
        total_subpaths += rings.len();
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
        let d: String = rings.iter().map(|ring| fitted.ring_data(ring)).collect();
        let rule = if rings.len() > 1 {
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

    // Sin découpage se emiten en el orden en que vienen, que ya es el de
    // emisión; con découpage, en el del apilado. Las del mismo color seguidas
    // siguen compartiendo su `<g>` en los dos casos.
    let natural: Vec<usize> = (0..regions.regions.len()).collect();
    let order: &[usize] = faces.as_ref().map_or(&natural, |f| &f.order);
    let mut i = 0;
    while i < order.len() {
        let color = regions.regions[order[i]].color;
        let end = order[i..]
            .iter()
            .position(|&idx| regions.regions[idx].color != color)
            .map_or(order.len(), |n| i + n);

        let paths: Vec<String> = order[i..end]
            .iter()
            .map(|&idx| {
                let rings = faces
                    .as_ref()
                    .map_or(&regions.regions[idx].rings, |f| &f.regions[idx]);
                total_subpaths += rings.len();
                let d: String = rings.iter().map(|ring| fitted.ring_data(ring)).collect();
                let rule = if rings.len() > 1 {
                    " fill-rule=\"evenodd\""
                } else {
                    ""
                };
                format!("{rule} d=\"{d}\"")
            })
            .collect();
        i = end;

        total_paths += paths.len();

        let mut fill = format!(" fill=\"{}\"", color.to_hex());
        if color.a < 255 {
            fill.push_str(&format!(
                " fill-opacity=\"{}\"",
                trim_float(color.a as f64 / 255.0)
            ));
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

/// Los anillos con los que se dibuja cada figura en modo découpage, y en qué
/// orden salen.
///
/// `ramps` y `regions` van indexados como `regions.ramps` y `regions.regions`,
/// para poder pedir los de una figura por su índice de siempre; `order` es la
/// permutación en la que hay que emitir las regiones, que es el apilado.
struct Faces {
    ramps: Vec<Vec<Ring>>,
    regions: Vec<Vec<Ring>>,
    order: Vec<usize>,
}

/// El découpage: cada figura recortada entera y metida por debajo de lo que se
/// le pone encima, como las capas de papel de un recorte.
///
/// # Por qué hace falta
///
/// Dos formas pegadas por una frontera compartida dejan una costura al
/// renderizar aunque la geometría sea exacta. El borde reparte la cobertura del
/// píxel entre las dos —media para cada una—, y como cada `<path>` se compone
/// por separado, lo que sale es medio color sobre medio lienzo y luego el otro
/// medio encima: un pelo más claro por toda la frontera. Es el artefacto de
/// conflación, y no se arregla trazando mejor.
///
/// Dilatar las formas con un `stroke` del color del relleno lo tapa, pero
/// engorda la figura media unidad por todos lados: en pixel art eso saca los
/// píxeles de la retícula, y en una curva se come el detalle fino.
///
/// # Qué se hace en su lugar
///
/// Cada capa se dibuja como la **unión de sí misma con las vecinas que van por
/// encima**. Como lo de arriba se pinta después y es opaco, lo que se ve no
/// cambia ni un píxel; lo que cambia es lo que hay **debajo** del borde
/// antialiaseado de la de arriba, que pasa de ser lienzo vacío a ser el color
/// sólido de la de abajo. El borde mezcla entonces los dos colores que de
/// verdad se tocan ahí, que es exactamente lo que tenía que hacer.
///
/// La frontera compartida queda por dentro de la unión y desaparece del
/// contorno, así que la geometría de cada pieza no se toca: no hay nada que
/// dilatar ni ningún `stroke` que emitir.
///
/// # De dónde sale la unión
///
/// De los propios tramos. Un tramo pertenece al contorno de una cara cuando
/// tiene **exactamente un lado dentro**, y recorrerlo con la cara a la
/// izquierda deja los anillos como los quiere [`crate::region::rings`], que es
/// el mismo camino por el que un degradado funde sus bandas sin recortar
/// polígonos.
///
/// # El orden de apilado
///
/// Los degradados al fondo —son el sombreado, y va debajo de todo— y luego las
/// regiones **de mayor a menor área**: la lámina grande abajo y el detalle
/// pegado encima, que es como se monta un découpage de verdad.
///
/// Además es el orden barato. De cada par de vecinas, la que absorbe es la de
/// abajo, así que ordenar de grande a pequeña hace que lo que se copia sea
/// siempre el contorno de la **menor** de las dos. Sobre
/// `examples/results-to-improve/cover.jpg` con `--fit spline`, apilar por área
/// deja el documento en 187 KB donde emitirlas en el orden de siempre —colores
/// más presentes primero— lo dejaba en 390 KB, con las mismas cero costuras y
/// algo menos de error de color.
///
/// # Lo que queda
///
/// La costura desaparece, pero el apilado deja un resto propio: si una capa
/// intermedia absorbe una pieza, su contorno de cara pasa por las **otras**
/// fronteras de esa pieza, y en esos bordes mete un cuarto de su color en la
/// mezcla. Es un error sobre un píxel de borde que ya era mezcla, y sale mucho
/// más barato que la costura: medido contra un supermuestreo a 4x de la misma
/// imagen, el error medio de la conversión de `cover.jpg` baja de 1,54 a 0,75.
fn faces(regions: &Regions) -> Faces {
    // El espacio de identificadores es el de la segmentación, que es el que
    // nombran los tramos, y no el de `regions.regions`: fundir degradados corre
    // los índices. Ver [`crate::region::Regions::moved`].
    let ids = if regions.moved.is_empty() {
        regions.regions.len()
    } else {
        regions.moved.len()
    };
    let ramps = regions.ramps.len();
    let count = ramps + regions.regions.len();

    // De mayor a menor área, con el índice de desempate para que dos regiones
    // del mismo tamaño no se ordenen según le apetezca al ordenador: el
    // documento tiene que salir igual dos veces.
    let mut order: Vec<usize> = (0..regions.regions.len()).collect();
    order.sort_by(|&a, &b| {
        regions.regions[b]
            .area
            .cmp(&regions.regions[a].area)
            .then(a.cmp(&b))
    });
    let mut rank = vec![0usize; regions.regions.len()];
    for (at, &i) in order.iter().enumerate() {
        rank[i] = at;
    }

    // La capa de cada identificador, y quién la compone: un degradado se lleva
    // varias bandas, así que una capa no es siempre una región.
    let mut layer = vec![usize::MAX; ids];
    let mut members: Vec<Vec<usize>> = vec![Vec::new(); count];
    for (id, slot) in layer.iter_mut().enumerate() {
        *slot = match regions.drawn_at(Some(id)) {
            Some(Moved::Ramp(r)) => r,
            Some(Moved::Region(i)) => ramps + rank[i],
            None => continue,
        };
        members[*slot].push(id);
    }

    let mut incident: Vec<Vec<(EdgeId, bool)>> = vec![Vec::new(); ids];
    for (id, edge) in regions.edges.iter().enumerate() {
        incident[edge.left].push((id, false));
        if let Some(right) = edge.right {
            incident[right].push((id, true));
        }
    }

    // Marca de en qué cara está metido cada identificador. El número de capa
    // vale de sello, así que no hay que limpiarla entre una capa y la siguiente.
    let mut face = vec![usize::MAX; ids];
    let mut rings: Vec<Vec<Ring>> = Vec::with_capacity(count);
    let mut members_of_face: Vec<usize> = Vec::new();
    let mut uses: Vec<(EdgeId, bool)> = Vec::new();

    for (current, layer_members) in members.iter().enumerate() {
        members_of_face.clear();
        for &id in layer_members {
            face[id] = current;
            members_of_face.push(id);
        }
        // Y lo que se le pone encima, que es lo que hay que tapar. Sólo si es
        // opaco: por debajo de algo translúcido no se puede meter color sin que
        // se transparente, y ahí la costura es preferible a cambiar el dibujo.
        //
        // Se mira sólo a las vecinas de la capa y no a las de lo que absorbe:
        // con eso ya no queda ninguna frontera con lienzo debajo —la de dos
        // piezas la tapa siempre la de abajo de las dos—, y encadenarlo
        // arrastraría media imagen bajo cada figura sin tapar nada más.
        for &id in layer_members {
            for &(edge, _) in &incident[id] {
                let edge = &regions.edges[edge];
                for side in [Some(edge.left), edge.right] {
                    let Some(other) = side else { continue };
                    if face[other] == current || layer[other] <= current {
                        continue;
                    }
                    if !opaque(regions, other) {
                        continue;
                    }
                    face[other] = current;
                    members_of_face.push(other);
                }
            }
        }

        // El contorno de la cara son los tramos con **exactamente un lado
        // dentro**, recorridos con la cara a la izquierda. Los de dentro —la
        // frontera compartida con lo que absorbe— no se emiten, que es
        // justamente lo que hace sólida a la capa.
        uses.clear();
        for &id in &members_of_face {
            for &(edge, reversed) in &incident[id] {
                let other = if reversed {
                    Some(regions.edges[edge].left)
                } else {
                    regions.edges[edge].right
                };
                if other.is_none_or(|other| face[other] != current) {
                    uses.push((edge, reversed));
                }
            }
        }
        rings.push(crate::region::rings(&regions.edges, &uses));
    }

    let by_rank = rings.split_off(ramps);
    let mut per_region: Vec<Vec<Ring>> = vec![Vec::new(); order.len()];
    for (at, r) in by_rank.into_iter().enumerate() {
        per_region[order[at]] = r;
    }
    Faces {
        ramps: rings,
        regions: per_region,
        order,
    }
}

/// Si por debajo de esta figura se puede meter color sin que se note.
///
/// Sólo lo es una región que siga dibujándose por su cuenta y sea opaca: una
/// banda que se llevó un degradado ya no tiene color propio que consultar, y
/// una traslúcida dejaría ver lo que se le metiera debajo.
fn opaque(regions: &Regions, id: usize) -> bool {
    match regions.drawn_at(Some(id)) {
        Some(Moved::Region(i)) => regions.regions[i].color.a == 255,
        _ => false,
    }
}

fn trim_float(v: f64) -> String {
    let s = format!("{:.3}", v);
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}
