//! Segmentación por rejilla: etiquetas, fronteras compartidas y découpage.
//!
//! La rejilla saca sus contornos por el mismo sitio que el clustering, así que
//! lo que se comprueba aquí es lo mismo que allí: que la topología cuadra y que
//! la frontera entre dos vecinas es **un solo tramo**. Eso último es lo que hace
//! que el ajuste la ajuste una vez y las dos caras reciban lo mismo; sin ello,
//! `--fit polygon` y `--fit spline` separaban las dos caras hasta la tolerancia
//! y entre ellas asomaba el fondo.

use vektro::color::Rgba;
use vektro::fit::Fit;
use vektro::grid::PixelMap;
use vektro::region::Regions;
use vektro::segment::{self, Grouping};
use vektro::svg;

const ROJO: Rgba = Rgba {
    r: 214,
    g: 41,
    b: 41,
    a: 255,
};
const VERDE: Rgba = Rgba {
    r: 41,
    g: 173,
    b: 74,
    a: 255,
};
const AZUL: Rgba = Rgba {
    r: 33,
    g: 74,
    b: 214,
    a: 255,
};

/// Un mapa de píxeles lógicos escrito fila a fila. `.` es transparente.
fn mapa(rows: &[&str], paleta: &[(char, Rgba)]) -> PixelMap {
    let (w, h) = (rows[0].len(), rows.len());
    let mut pixels = Vec::with_capacity(w * h);
    for row in rows {
        assert_eq!(row.len(), w, "las filas no miden lo mismo");
        for c in row.chars() {
            pixels.push(if c == '.' {
                None
            } else {
                Some(
                    paleta
                        .iter()
                        .find(|&&(k, _)| k == c)
                        .unwrap_or_else(|| panic!("carácter {c:?} sin color"))
                        .1,
                )
            });
        }
    }
    PixelMap {
        width: w,
        height: h,
        pixels,
    }
}

fn regiones(rows: &[&str], paleta: &[(char, Rgba)], grouping: Grouping) -> Regions {
    segment::from_pixel_map(&mapa(rows, paleta), grouping)
}

fn documento(regions: &Regions, fit: Fit, decoupage: bool) -> String {
    svg::render(
        regions,
        &svg::Options {
            pixel_size: 1,
            display: None,
            background: None,
            fit,
            decoupage,
        },
    )
    .svg
}

/// Área encerrada por un anillo, con signo, por la fórmula del cordón de zapato.
fn area_con_signo(points: &[(i32, i32)]) -> f64 {
    let n = points.len();
    let mut doble = 0i64;
    for i in 0..n {
        let (x0, y0) = points[i];
        let (x1, y1) = points[(i + 1) % n];
        doble += x0 as i64 * y1 as i64 - x1 as i64 * y0 as i64;
    }
    doble as f64 / 2.0
}

/// La prueba de fuego, la misma que en `tests/boundary.rs`.
///
/// La suma **con signo** de los anillos de una región tiene que ser exactamente
/// `-área`. El valor absoluto ya obliga a que no falte ni sobre ningún tramo; el
/// signo, además, fija la orientación, y que sea la suma y no la de valores
/// absolutos obliga a que los agujeros resten. Un tramo perdido, uno recorrido
/// al revés, un anillo mal encadenado o un agujero con el sentido cambiado
/// fallan todos aquí.
fn comprueba_areas(regions: &Regions) {
    for (id, region) in regions.regions.iter().enumerate() {
        let total: f64 = region
            .rings
            .iter()
            .map(|ring| area_con_signo(&regions.ring_points(ring)))
            .sum();
        assert_eq!(
            total,
            -(region.area as f64),
            "la región {id} ({}) encierra {total} y ocupa {}",
            region.color.to_hex(),
            region.area
        );
    }
}

#[test]
fn las_areas_cuadran_en_un_dibujo_con_agujeros_y_transparencia() {
    let r = regiones(
        &[
            "RRRRRR", "RGGGGR", "RG..GR", "RG.AGR", "RGGGGR", "RRRRRR", ".RRRR.",
        ],
        &[('R', ROJO), ('G', VERDE), ('A', AZUL)],
        Grouping::Region,
    );
    comprueba_areas(&r);
}

#[test]
fn las_areas_cuadran_tambien_con_un_path_por_color() {
    let r = regiones(
        &["RGRGRG", "GRGRGR", "RGRGRG", "GRGRGR"],
        &[('R', ROJO), ('G', VERDE)],
        Grouping::Color,
    );
    comprueba_areas(&r);
    assert_eq!(r.regions.len(), 2, "un color, una región");
}

/// Lo que hace que la rejilla deje de abrir huecos al simplificar el contorno.
///
/// Con la frontera compartida en un solo tramo, el ajuste la ajusta una vez y
/// las dos vecinas reciben exactamente los mismos puntos. Cuando cada región se
/// trazaba por su cuenta salía dos veces, se ajustaba dos veces y las dos caras
/// se separaban hasta la tolerancia.
#[test]
fn la_frontera_entre_dos_vecinas_es_un_solo_tramo() {
    let r = regiones(
        &["RRGG", "RRGG", "RRGG"],
        &[('R', ROJO), ('G', VERDE)],
        Grouping::Region,
    );
    let compartidos = r.edges.iter().filter(|e| e.right.is_some()).count();
    assert_eq!(compartidos, 1, "hay una frontera y tiene que ser un tramo");

    // Y el tramo lo usan las dos, cada una en un sentido.
    let frontera = r.edges.iter().position(|e| e.right.is_some()).unwrap();
    for region in &r.regions {
        assert!(
            region
                .rings
                .iter()
                .any(|ring| ring.iter().any(|&(edge, _)| edge == frontera)),
            "las dos regiones tienen que recorrer la frontera compartida"
        );
    }
}

/// Découpage en pixel art: la pieza de abajo se mete entera bajo la de arriba.
///
/// Es lo que quita la costura al simplificar el contorno, que es donde el
/// escalón deja de coincidir con la retícula y el borde antialiaseado reparte
/// la cobertura del píxel entre las dos formas.
#[test]
fn el_decoupage_apila_tambien_en_la_rejilla() {
    let r = regiones(&["RRRA"], &[('R', ROJO), ('A', AZUL)], Grouping::Region);

    let plano = documento(&r, Fit::Pixel, false);
    let capas = documento(&r, Fit::Pixel, true);

    assert!(
        plano.contains("d=\"M3 0h-3v1h3z\""),
        "el rojo pegado se queda en sus tres píxeles:\n{plano}"
    );
    assert!(
        capas.contains("d=\"M0 0v1h4v-1z\""),
        "el rojo tiene que extenderse bajo el azul:\n{capas}"
    );
    assert!(
        capas.contains("d=\"M3 1h1v-1h-1z\""),
        "el azul no cambia de forma:\n{capas}"
    );
    // Y las coordenadas siguen siendo enteras: el découpage no dilata nada, así
    // que un píxel del dibujo sigue midiendo un píxel.
    for (_, dato) in capas.match_indices("d=\"").map(|(at, _)| {
        let resto = &capas[at + 3..];
        (at, &resto[..resto.find('"').unwrap()])
    }) {
        assert!(
            !dato.contains('.'),
            "el découpage saca los píxeles de la retícula: {dato}"
        );
    }
}
