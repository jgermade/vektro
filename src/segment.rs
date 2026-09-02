//! Segmentación: de la imagen a un conjunto de regiones.
//!
//! Es uno de los dos ejes de la conversión. Hoy sólo existe la segmentación por
//! rejilla, que da por hecho que el dibujo está sobre una cuadrícula regular y
//! la recupera; la de clustering, para fotos, va aparte cuando exista.

use std::collections::HashMap;

use crate::boundary;
use crate::color::Rgba;
use crate::grid::PixelMap;
use crate::region::{Region, Regions};
use crate::trace;

/// Qué cuenta como una región.
///
/// Es una decisión de segmentación y no de dibujo: cambia en qué se parte la
/// imagen, no cómo se pinta lo que salga.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Grouping {
    /// Cada bloque de píxeles contiguos es una región.
    #[default]
    Region,
    /// Todo lo que comparte color es una sola región, con un anillo por bloque.
    Color,
}

/// Segmenta un mapa de píxeles lógicos.
///
/// Las regiones salen en orden de emisión: los colores más presentes primero
/// —así los paths grandes quedan al fondo del documento— y, dentro de un color,
/// por posición del primer píxel del bloque.
///
/// El contorno lo saca [`crate::boundary`], igual que el del clustering: se
/// etiqueta cada píxel con su región y se recorren las grietas una sola vez. Lo
/// que se gana con eso es que **la frontera entre dos vecinas es un solo tramo**,
/// así que el ajuste la ajusta una vez y las dos caras reciben lo mismo. Trazar
/// cada región por su cuenta, que es lo que se hacía antes, la ajustaba dos
/// veces con resultados distintos, y con `--fit polygon` o `--fit spline` las
/// dos caras se separaban hasta la tolerancia y entre ellas asomaba el fondo.
pub fn from_pixel_map(map: &PixelMap, grouping: Grouping) -> Regions {
    let mut order: Vec<Rgba> = Vec::new();
    let mut counts: HashMap<Rgba, usize> = HashMap::new();
    for pixel in map.pixels.iter().flatten() {
        if counts.insert(*pixel, 0).is_none() {
            order.push(*pixel);
        }
        *counts.get_mut(pixel).unwrap() += 1;
    }
    order.sort_by(|a, b| counts[b].cmp(&counts[a]).then(a.to_hex().cmp(&b.to_hex())));

    // Una etiqueta por región, en el orden de emisión: se recorren los colores
    // ya ordenados y, dentro de cada uno, sus bloques por el primer píxel.
    let mut labels = vec![boundary::NONE; map.pixels.len()];
    let mut found: Vec<(Rgba, usize)> = Vec::new();
    for color in order {
        let mask: Vec<bool> = map
            .pixels
            .iter()
            .map(|p| p.as_ref() == Some(&color))
            .collect();

        let blocks: Vec<Vec<usize>> = match grouping {
            // Un color, una región: todos sus bloques bajo la misma etiqueta, y
            // el contorno saldrá con un anillo por bloque.
            Grouping::Color => vec![(0..mask.len()).filter(|&i| mask[i]).collect()],
            Grouping::Region => trace::components(&mask, map.width, map.height),
        };

        for block in blocks {
            if block.is_empty() {
                continue;
            }
            let id = found.len() as u32;
            for &i in &block {
                labels[i] = id;
            }
            found.push((color, block.len()));
        }
    }

    let (edges, rings) = boundary::from_labels(map.width, map.height, &labels, found.len());
    let regions = found
        .into_iter()
        .zip(rings)
        .map(|((color, area), rings)| Region { color, area, rings })
        .collect();

    Regions {
        width: map.width,
        height: map.height,
        colors: counts.len(),
        regions,
        // La rejilla no busca degradados: sus colores son los que el autor puso,
        // no una rampa continua repartida en escalones por la tolerancia.
        ramps: Vec::new(),
        edges,
        moved: Vec::new(),
    }
}
