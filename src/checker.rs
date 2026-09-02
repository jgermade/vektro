//! Detección de la cuadrícula de transparencia.
//!
//! Cuando alguien captura la pantalla de un editor, el damero blanco/gris con
//! el que se dibuja el fondo transparente se queda pegado en la imagen como
//! píxeles opacos. Aquí se busca ese patrón —dos grises alternándose en un
//! tablero regular— y se devuelve a transparencia.
//!
//! El reconocimiento es exigente a propósito: sólo se borran los píxeles que
//! caen en casillas *enteras* del damero, así que un blanco suelto del dibujo
//! que coincida con el tono de la casilla que le toca sobrevive.
//!
//! La rejilla dice **dónde** están las casillas, y la imagen **de qué tono** es
//! cada una. Esa segunda parte no se calcula: parecía natural sacarla de la
//! paridad de la casilla, `(cx + cy) & 1`, pero eso obliga a clavar el paso a
//! una fracción de píxel. En una imagen de 2564 px con casillas de 40, un error
//! de 0.3 en el paso corre la cuenta media casilla antes de llegar abajo y la
//! paridad se invierte de ahí en adelante; y hay imágenes cuyo damero ni
//! siquiera tiene un paso constante, así que no existe el número que lo arregle.
//! Leyendo el tono de cada casilla, la alternancia se ancla sola en cada zona.

use std::collections::HashMap;

use image::RgbaImage;

use crate::color::Rgba;

/// Etiqueta de un píxel que es mezcla de los dos tonos, y de ninguno de ellos.
const MIX: u8 = 3;
/// Etiqueta de un píxel ajeno al damero.
const OTHER: u8 = 2;

/// Diferencia máxima entre canales para considerar un color un gris.
const MAX_SATURATION: i32 = 24;
/// Los dos tonos del damero se parecen, pero se distinguen.
const CONTRAST: std::ops::Range<i32> = 4..140;
/// Margen con el que se reconoce cada tono. Absorbe el ruido de compresión sin
/// llegar a tragarse los planos vecinos del dibujo.
const MATCH: f64 = 12.0;
/// Colores más frecuentes entre los que se busca la pareja.
const CANDIDATES: usize = 8;
/// Parejas que se llegan a analizar a fondo, de más a menos frecuentes.
const PAIRS: usize = 4;
/// Tiras mínimas por eje para fiarse de la medida.
const MIN_RUNS: usize = 24;
/// Proporción de tiras que debe medir lo mismo. Es el criterio flojo: el dibujo
/// suele traer blancos que se funden con los del damero y parten las tiras.
const UNIFORMITY: f64 = 0.7;
/// Proporción de tiras completas que debe arrancar en la misma fase. Este es el
/// criterio duro: una rejilla de verdad las alinea todas.
const ALIGNMENT: f64 = 0.9;
/// Proporción de la casilla que debe llevar un mismo tono para dárselo.
const CELL_AGREEMENT: f64 = 0.9;
/// Proporción de la casilla que tiene que ser tono limpio para poder juzgarla.
/// Sin esto, una casilla que el reescalado ha dejado casi toda en mezcla se
/// quedaría con el tono de los cuatro píxeles sueltos que le sobrevivan.
///
/// Se mide sobre **su** superficie, no sobre la de una casilla entera: las de
/// los cuatro bordes de la imagen están cortadas, y pedirles lo mismo que a una
/// completa es pedirles el 100% de tono limpio. Eran justo lo único que se
/// quedaba sin borrar: una franja de un borde a otro arriba, abajo y a los lados.
const CELL_SOLID: f64 = 0.5;
/// Casillas que como mucho puede ocupar una bolsa suelta para barrerla entera.
const POCKET_CELLS: f64 = 12.0;
/// Parte de una bolsa que tiene que llevar el tono menos abundante para creerse
/// que es damero. Un plano del dibujo trae uno solo; el damero, los dos.
///
/// Bajo a propósito: una bolsa de tres casillas alterna A-B-A y ya se queda en
/// un tercio, y si el dibujo le come parte de la del medio baja de ahí. Las
/// medidas sobre la imagen de referencia caían en 0.21 y 0.248.
const POCKET_BALANCE: f64 = 0.15;
/// Por debajo de esta fracción de imagen, la detección se descarta.
const MIN_COVERAGE: f64 = 0.05;

#[derive(Clone, Copy, Debug)]
pub struct Checkerboard {
    /// Lado de la casilla por eje, en píxeles reales. No tiene por qué ser
    /// entero: basta con que la imagen se haya reescalado alguna vez.
    pub cell: (f64, f64),
    /// Los dos tonos del damero.
    pub colors: (Rgba, Rgba),
    /// Fracción de la imagen devuelta a transparencia.
    pub coverage: f64,
}

/// La rejilla encajada: a qué casilla pertenece cada coordenada de cada eje.
///
/// Se guarda casilla por coordenada, y no como un paso y una fase, porque el
/// paso sale con dos decimales y sobre sesenta casillas ese redondeo corre la
/// cuenta media casilla. Ver [`boundaries`].
struct Lattice {
    /// Tamaño medio de la casilla, sólo para informar.
    cell: (f64, f64),
    /// Casilla de cada `x`, y de cada `y`. Empiezan en 0 y no bajan.
    column: Vec<usize>,
    row: Vec<usize>,
}

impl Lattice {
    /// Coordenadas de la casilla que contiene el píxel.
    fn cell_at(&self, x: usize, y: usize) -> (usize, usize) {
        (self.column[x], self.row[y])
    }

    /// Casillas que hay por eje.
    fn size(&self) -> (usize, usize) {
        (
            self.column.last().map_or(0, |c| c + 1),
            self.row.last().map_or(0, |r| r + 1),
        )
    }
}

/// Fronteras reales de las casillas de un eje, leídas de la imagen.
///
/// En la línea donde acaba una casilla, casi todos los píxeles del fondo cambian
/// de tono a la vez: es un pico que se ve desde lejos aunque el dibujo tape media
/// imagen. Se recorre prediciendo `anterior + paso` y encajando cada predicción
/// en el mejor pico que haya cerca.
///
/// Encajar **desde la anterior ya encajada** es lo que hace que funcione: cada
/// paso vuelve a anclarse, así que la ventana sólo tiene que cubrir el error de
/// un paso —unas décimas— y no el acumulado. Un damero cuyo paso varía por zonas
/// se sigue en vez de promediarse. Donde el dibujo tapa la frontera no hay pico
/// y vale la predicción, que es lo que se quiere.
fn boundaries(
    labels: &[u8],
    w: usize,
    h: usize,
    horizontal: bool,
    cell: f64,
    offset: f64,
) -> Vec<usize> {
    let (len, lines) = if horizontal { (w, h) } else { (h, w) };
    let at = |i: usize, line: usize| {
        labels[if horizontal {
            line * w + i
        } else {
            i * w + line
        }]
    };

    // Cuántos píxeles cambian de tono al pasar de la línea `i - 1` a la `i`.
    let mut score = vec![0u32; len];
    for (i, marca) in score.iter_mut().enumerate().skip(1) {
        *marca = (0..lines)
            .filter(|&line| {
                let (a, b) = (at(i - 1, line), at(i, line));
                a < 2 && b < 2 && a != b
            })
            .count() as u32;
    }

    // Cuánto tiene que marcar un pico para hacerle caso. Una frontera de verdad
    // la cruzan casi todas las líneas que son fondo, así que se mira cuánto
    // marca la frontera mediana y se pide la mitad de eso. Con menos se deja la
    // predicción: en un damero de paso constante la aritmética ya acierta, y
    // encajar contra un pico de ruido la estropearía, además de arrastrar el
    // error a todas las fronteras siguientes.
    let expected = (len as f64 / cell).max(1.0) as usize;
    let mut ranked = score.clone();
    ranked.sort_unstable_by(|a, b| b.cmp(a));
    let strong = (ranked[(expected / 2).min(ranked.len() - 1)] / 2).max(1);

    let window = (cell / 3.0).round().max(1.0) as usize;
    let snap = |centre: f64| -> f64 {
        let lo = (centre - window as f64).round().max(1.0) as usize;
        let hi = ((centre + window as f64).round() as usize).min(len - 1);
        match (lo..=hi).max_by_key(|&i| score[i]) {
            Some(best) if score[best] >= strong => best as f64,
            _ => centre,
        }
    };

    // Se arranca de la fase que dio el ajuste y se encadena hacia los dos lados.
    let mut cuts: Vec<f64> = Vec::new();
    let mut at_cut = snap(offset);
    while at_cut > 0.0 {
        cuts.push(at_cut);
        at_cut = snap(at_cut - cell);
        if cuts.last().is_some_and(|&last| at_cut >= last - cell * 0.5) {
            break;
        }
    }
    cuts.reverse();
    let mut at_cut = cuts.last().copied().unwrap_or(offset);
    loop {
        at_cut = snap(at_cut + cell);
        if at_cut >= len as f64 - 1.0 {
            break;
        }
        cuts.push(at_cut);
    }

    // De cortes a casilla por coordenada.
    let mut index = Vec::with_capacity(len);
    let mut k = 0;
    for i in 0..len {
        while k < cuts.len() && (i as f64) >= cuts[k] {
            k += 1;
        }
        index.push(k);
    }
    index
}

/// Busca la cuadrícula y, si la encuentra, deja transparentes sus píxeles.
///
/// Se analizan las parejas de grises más frecuentes y gana la que más imagen
/// cubre: un dibujo puede tener dos grises que se alternen por casualidad en
/// algún rincón, pero el fondo transparente ocupa mucho más.
pub fn remove(img: &mut RgbaImage) -> Option<Checkerboard> {
    let (w, h) = (img.width() as usize, img.height() as usize);
    let candidates = frequent_colors(img);

    let mut pairs = Vec::new();
    for i in 0..candidates.len() {
        for j in i + 1..candidates.len() {
            let ((a, na), (b, nb)) = (candidates[i], candidates[j]);
            if plausible_pair(a, b) {
                pairs.push((na + nb, a, b));
            }
        }
    }
    pairs.sort_by(|x, y| y.0.cmp(&x.0));

    let mut best: Option<Candidate> = None;
    for &(_, a, b) in pairs.iter().take(PAIRS) {
        let labels = label(img, a, b, MATCH);
        let Some(lattice) = fit(&labels, w, h) else {
            continue;
        };
        let board = read_board(&labels, w, h, &lattice);
        if board.matching as f64 / (w * h) as f64 >= MIN_COVERAGE
            && best
                .as_ref()
                .is_none_or(|found| board.matching > found.board.matching)
        {
            best = Some(Candidate {
                colors: (a, b),
                lattice,
                labels,
                board,
            });
        }
    }

    let found = best?;
    let erased = erase(img, &found.labels, w, h, &found.lattice, &found.board);
    Some(Checkerboard {
        cell: found.lattice.cell,
        colors: found.colors,
        coverage: erased as f64 / (w * h) as f64,
    })
}

/// Una pareja de tonos ya analizada, lista para aplicar.
struct Candidate {
    colors: (Rgba, Rgba),
    lattice: Lattice,
    labels: Vec<u8>,
    board: Board,
}

/// Los colores opacos más repetidos de la imagen, con su recuento.
fn frequent_colors(img: &RgbaImage) -> Vec<(Rgba, usize)> {
    let mut counts: HashMap<[u8; 4], usize> = HashMap::new();
    for pixel in img.pixels() {
        if pixel.0[3] == 255 {
            *counts.entry(pixel.0).or_insert(0) += 1;
        }
    }
    let mut list: Vec<([u8; 4], usize)> = counts.into_iter().collect();
    list.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    list.into_iter()
        .take(CANDIDATES)
        .map(|(c, n)| (Rgba::new(c[0], c[1], c[2], c[3]), n))
        .collect()
}

/// Dos grises parecidos pero distinguibles: el perfil de un damero.
fn plausible_pair(a: Rgba, b: Rgba) -> bool {
    let gray = |c: Rgba| {
        let (max, min) = (c.r.max(c.g).max(c.b) as i32, c.r.min(c.g).min(c.b) as i32);
        max - min <= MAX_SATURATION
    };
    let luma = |c: Rgba| (c.r as i32 * 30 + c.g as i32 * 59 + c.b as i32 * 11) / 100;
    gray(a) && gray(b) && CONTRAST.contains(&(luma(a) - luma(b)).abs())
}

/// Un color a medio camino entre los dos tonos, y de ninguno de los dos.
///
/// Es lo que deja un reescalado en la frontera entre dos casillas: ni el claro
/// ni el oscuro, sino la mezcla que salga del filtro. Se reconoce por la
/// desigualdad triangular —un punto del segmento que une los dos tonos suma
/// justo la distancia que los separa— con la misma holgura que el resto.
fn blended(c: Rgba, a: Rgba, b: Rgba, margin: f64) -> bool {
    c.distance(&a) + c.distance(&b) <= a.distance(&b) + margin
}

/// Marca cada píxel con el tono al que se parece: 0, 1, [`MIX`] o [`OTHER`].
fn label(img: &RgbaImage, a: Rgba, b: Rgba, margin: f64) -> Vec<u8> {
    img.pixels()
        .map(|p| {
            if p.0[3] != 255 {
                return OTHER;
            }
            let c = Rgba::new(p.0[0], p.0[1], p.0[2], p.0[3]);
            let (da, db) = (c.distance(&a), c.distance(&b));
            if da <= margin && da <= db {
                0
            } else if db <= margin {
                1
            } else if blended(c, a, b, margin) {
                MIX
            } else {
                OTHER
            }
        })
        .collect()
}

/// Tiras de color uniforme rodeadas por el otro tono, agrupadas por línea. Las
/// de los extremos están cortadas y no miden la casilla, así que se descartan.
///
/// Van por líneas y no en una lista sola porque [`axis_fit`] mide de una tira a
/// la siguiente, y eso sólo tiene sentido dentro de la misma línea.
fn runs(labels: &[u8], w: usize, h: usize, horizontal: bool) -> Vec<Vec<(u32, u32)>> {
    let (len, lines) = if horizontal { (w, h) } else { (h, w) };
    let at = |line: usize, i: usize| -> u8 {
        labels[if horizontal {
            line * w + i
        } else {
            i * w + line
        }]
    };

    let mut out = Vec::new();
    for line in 0..lines {
        let mut here = Vec::new();
        // Segmentos (etiqueta, inicio, largo) de la línea.
        let mut segments: Vec<(u8, u32, u32)> = Vec::new();
        let mut start = 0;
        for i in 1..=len {
            if i == len || at(line, i) != at(line, start) {
                segments.push((at(line, start), start as u32, (i - start) as u32));
                start = i;
            }
        }
        // Qué tono hay a un lado, saltándose la mezcla. En una imagen reescalada
        // cada casilla llega a la siguiente por una franja de mezcla, y sin
        // saltarla no habría una sola tira que alternase: la tira de al lado no
        // es del otro tono, es el degradado que lleva hasta él.
        let beside = |mut k: usize, back: bool| loop {
            match segments.get(k) {
                None => return OTHER,
                Some(&(label, ..)) if label != MIX => return label,
                _ if back => match k.checked_sub(1) {
                    None => return OTHER,
                    Some(prev) => k = prev,
                },
                _ => k += 1,
            }
        };

        let inner = segments.len().saturating_sub(1);
        for (k, &(label, from, length)) in segments.iter().enumerate().take(inner).skip(1) {
            // Sólo los dos tonos miden la casilla: [`MIX`] es su frontera y
            // [`OTHER`] no tiene pareja con la que alternar.
            if label > 1 {
                continue;
            }
            let other = 1 - label;
            if beside(k - 1, true) == other && beside(k + 1, false) == other {
                here.push((from, length));
            }
        }
        if !here.is_empty() {
            out.push(here);
        }
    }
    out
}

/// Valor más repetido, con su recuento.
fn mode(values: impl Iterator<Item = u32>) -> Option<(u32, usize, usize)> {
    let mut counts: HashMap<u32, usize> = HashMap::new();
    let mut total = 0;
    for v in values {
        *counts.entry(v).or_insert(0) += 1;
        total += 1;
    }
    counts
        .into_iter()
        .max_by_key(|&(value, count)| (count, std::cmp::Reverse(value)))
        .map(|(value, count)| (value, count, total))
}

/// Deduce el tamaño de casilla y el encaje de la rejilla a partir de las tiras.
///
/// Un damero de verdad da tiras del mismo largo, en ambos ejes y todas alineadas
/// a la misma rejilla. Cualquier grieta en esas tres condiciones descarta la
/// pareja de colores: dos tonos del dibujo que se alternen sin más no las
/// cumplen, y colarlos costaría borrar parte del dibujo.
fn fit(labels: &[u8], w: usize, h: usize) -> Option<Lattice> {
    let rows = runs(labels, w, h, true);
    let cols = runs(labels, w, h, false);
    let counted = |lines: &[Vec<(u32, u32)>]| lines.iter().map(Vec::len).sum::<usize>();
    if counted(&rows) < MIN_RUNS || counted(&cols) < MIN_RUNS {
        return None;
    }
    let (cell_x, offset_x) = axis_fit(&rows)?;
    let (cell_y, offset_y) = axis_fit(&cols)?;

    // Las casillas son cuadradas; un reescalado las deforma un poco, no más.
    if (cell_x - cell_y).abs() > cell_x.max(cell_y) * 0.1 {
        return None;
    }
    // Ni dónde cae cada frontera —lo leen [`boundaries`] de la imagen— ni qué
    // tono ocupa cada casilla, que lo lee [`read_board`]. De aquí sale sólo el
    // paso y la fase de partida.
    Some(Lattice {
        cell: (cell_x, cell_y),
        column: boundaries(labels, w, h, true, cell_x, offset_x),
        row: boundaries(labels, w, h, false, cell_y, offset_y),
    })
}

/// Tamaño de casilla y fase de un eje, a partir de las tiras que mide.
///
/// El tamaño puede salir decimal, así que se admiten tiras de un píxel más o
/// menos que la moda y se promedian. La fase se saca en círculo (sumando cada
/// arranque como un ángulo), que es lo que tolera esos redondeos: su módulo
/// mide de paso lo bien alineadas que están.
fn axis_fit(lines: &[Vec<(u32, u32)>]) -> Option<(f64, f64)> {
    let all: Vec<(u32, u32)> = lines.iter().flatten().copied().collect();
    let (peak, _, total) = mode(all.iter().map(|r| r.1))?;
    let accepted: Vec<(u32, u32)> = all
        .iter()
        .copied()
        .filter(|&(_, len)| len + 1 >= peak && len <= peak + 1)
        .collect();
    if (accepted.len() as f64) < total as f64 * UNIFORMITY {
        return None;
    }

    let n = accepted.len() as f64;
    let starts: Vec<f64> = accepted.iter().map(|&(start, _)| start as f64).collect();

    // El tamaño se mide **de un arranque al siguiente**, no por el largo de la
    // tira. Si la imagen se reescaló, el filtro difumina las dos puntas de cada
    // tira y le come un píxel; el largo sale corto y esa mordida no se cancela.
    // El sitio donde arranca la tira siguiente, en cambio, no se mueve.
    let steps: Vec<u32> = lines
        .iter()
        .flat_map(|line| line.windows(2).map(|pair| pair[1].0 - pair[0].0))
        .collect();
    let (step, _, _) = mode(steps.iter().copied())?;
    let near: Vec<f64> = steps
        .iter()
        .filter(|&&s| s + 1 >= step && s <= step + 1)
        .map(|&s| f64::from(s))
        .collect();
    let coarse = near.iter().sum::<f64>() / near.len() as f64;
    if coarse < 2.0 {
        return None;
    }

    // Promediar los largos deja el tamaño algo sesgado, y unas centésimas bastan
    // para que la fase se vaya al otro extremo de la imagen. Se afina buscando el
    // tamaño que más concentra los arranques.
    let (cell, (re, im)) = (0..=100)
        .map(|k| {
            let candidate = coarse - 0.5 + k as f64 / 100.0;
            (candidate, phase(&starts, candidate))
        })
        .max_by(|a, b| {
            let concentration = |(re, im): (f64, f64)| re.hypot(im);
            concentration(a.1).total_cmp(&concentration(b.1))
        })?;

    if re.hypot(im) / n < ALIGNMENT {
        return None;
    }
    let offset = (im.atan2(re) / std::f64::consts::TAU * cell).rem_euclid(cell);
    Some((cell, offset))
}

/// Suma de los arranques vistos como ángulos sobre un periodo. Su módulo mide lo
/// alineados que están, y su argumento dónde empieza la rejilla.
fn phase(starts: &[f64], cell: f64) -> (f64, f64) {
    let (mut re, mut im) = (0.0, 0.0);
    for start in starts {
        let angle = std::f64::consts::TAU * start / cell;
        re += angle.cos();
        im += angle.sin();
    }
    (re, im)
}

/// Índice de casilla de cada píxel, y las dimensiones del tablero.
fn cell_index(lattice: &Lattice) -> (impl Fn(usize, usize) -> usize + use<'_>, usize, usize) {
    let (cells_x, cells_y) = lattice.size();
    let index = move |x: usize, y: usize| -> usize {
        let (cx, cy) = lattice.cell_at(x, y);
        cy * cells_x + cx
    };
    (index, cells_x, cells_y)
}

/// El tablero: qué tono lleva cada casilla y cuáles son damero de verdad.
struct Board {
    /// Tono de cada casilla. Las confirmadas lo traen leído de la imagen; el
    /// resto, deducido de ellas por alternancia.
    tone: Vec<u8>,
    /// Casillas que son damero de principio a fin.
    ok: Vec<bool>,
    /// Píxeles que cuadran dentro de esas casillas; mide lo buena que es.
    matching: usize,
}

/// Vecinas ortogonales de una casilla, dentro del tablero.
fn neighbours(i: usize, cells_x: usize, cells_y: usize) -> impl Iterator<Item = usize> {
    let (cx, cy) = ((i % cells_x) as i64, (i / cells_x) as i64);
    [(-1i64, 0i64), (1, 0), (0, -1), (0, 1)]
        .into_iter()
        .filter_map(move |(dx, dy)| {
            let (nx, ny) = (cx + dx, cy + dy);
            let dentro = nx >= 0 && ny >= 0 && nx < cells_x as i64 && ny < cells_y as i64;
            dentro.then(|| ny as usize * cells_x + nx as usize)
        })
}

/// Lee el tono de cada casilla y se queda con las que alternan de verdad.
///
/// Donde el dibujo pisa la cuadrícula, la casilla no tiene un tono claro y se
/// queda entera: así un blanco suelto del dibujo no se lo lleva por delante.
///
/// Y no basta con que la casilla sea de un tono: un plano blanco del dibujo —el
/// ojo de un personaje, sin ir más lejos— lo es. Lo que distingue al fondo es la
/// **alternancia**, así que se le exige que al menos dos vecinas lleven el otro.
fn read_board(labels: &[u8], w: usize, h: usize, lattice: &Lattice) -> Board {
    let (index, cells_x, cells_y) = cell_index(lattice);
    let cells = cells_x * cells_y;
    let mut count = vec![[0u32; 2]; cells];
    let mut area = vec![0u32; cells];

    // Las mezclas no cuentan. En una imagen reescalada son el borde de la
    // casilla, y meterlas en el reparto bajaría del acuerdo a toda la rejilla.
    for y in 0..h {
        for x in 0..w {
            let i = index(x, y);
            area[i] += 1;
            let label = labels[y * w + x];
            if label < 2 {
                count[i][label as usize] += 1;
            }
        }
    }

    let read: Vec<Option<u8>> = (0..cells)
        .map(|i| {
            let (light, dark) = (count[i][0], count[i][1]);
            let seen = light + dark;
            if (seen as f64) < area[i] as f64 * CELL_SOLID {
                return None;
            }
            let enough = |n: u32| n as f64 >= seen as f64 * CELL_AGREEMENT;
            match (enough(light), enough(dark)) {
                (true, _) => Some(0),
                (_, true) => Some(1),
                _ => None,
            }
        })
        .collect();

    let ok: Vec<bool> = (0..cells)
        .map(|i| {
            let Some(t) = read[i] else { return false };
            neighbours(i, cells_x, cells_y)
                .filter(|&n| read[n] == Some(1 - t))
                .count()
                >= 2
        })
        .collect();

    Board {
        tone: spread_tones(&read, &ok, cells_x, cells_y),
        matching: (0..cells)
            .filter(|&i| ok[i])
            .map(|i| count[i][read[i].unwrap_or(0) as usize] as usize)
            .sum(),
        ok,
    }
}

/// Extiende el tono de las casillas confirmadas a las que no lo tienen.
///
/// El borrado necesita un tono contra el que comparar **en toda** la imagen, no
/// sólo donde el damero se ve limpio. Se propaga en anchura desde las
/// confirmadas alternando a cada paso, que es lo que hace un damero. Así la
/// paridad queda anclada a la zona de la que viene: si el paso de la rejilla se
/// desvía y la cuenta de casillas se corre, cada lado de la desviación conserva
/// la suya en vez de arrastrar una decisión tomada en la otra punta.
fn spread_tones(read: &[Option<u8>], ok: &[bool], cells_x: usize, cells_y: usize) -> Vec<u8> {
    let cells = cells_x * cells_y;
    let mut tone = vec![u8::MAX; cells];
    let mut queue: std::collections::VecDeque<usize> = (0..cells)
        .filter(|&i| ok[i])
        .inspect(|&i| tone[i] = read[i].unwrap_or(0))
        .collect();

    while let Some(i) = queue.pop_front() {
        for n in neighbours(i, cells_x, cells_y) {
            if tone[n] == u8::MAX {
                tone[n] = 1 - tone[i];
                queue.push_back(n);
            }
        }
    }
    // Sin ninguna casilla confirmada no hay nada que extender ni que borrar.
    tone.iter_mut().for_each(|t| {
        if *t == u8::MAX {
            *t = OTHER;
        }
    });
    tone
}

/// Vacía el damero y devuelve cuántos píxeles ha tocado.
///
/// Se parte de las casillas confirmadas y se extiende por contigüidad a todo
/// píxel que siga el patrón. Borrar sólo las casillas confirmadas dejaría un
/// residuo con el periodo del damero, que luego despista a la detección de la
/// rejilla del dibujo; y lo que queda suelto —un blanco del dibujo que no toca
/// el fondo— se conserva.
fn erase(
    img: &mut RgbaImage,
    labels: &[u8],
    w: usize,
    h: usize,
    lattice: &Lattice,
    board: &Board,
) -> usize {
    let (index, ..) = cell_index(lattice);
    let matches = |x: usize, y: usize| labels[y * w + x] == board.tone[index(x, y)];
    // La mezcla no siembra —sola no dice nada— pero sí deja pasar: es la
    // frontera entre dos casillas, y sin ella el borrado se queda a un lado y
    // deja una malla de un píxel con el paso del damero.
    let spreads = |x: usize, y: usize| matches(x, y) || labels[y * w + x] == MIX;

    let mut seen = vec![false; w * h];
    let mut stack: Vec<(usize, usize)> = Vec::new();
    for y in 0..h {
        for x in 0..w {
            if board.ok[index(x, y)] && matches(x, y) && !seen[y * w + x] {
                seen[y * w + x] = true;
                stack.push((x, y));
            }
        }
    }

    let mut erased = 0;
    while let Some((x, y)) = stack.pop() {
        img.get_pixel_mut(x as u32, y as u32).0[3] = 0;
        erased += 1;
        for (nx, ny) in [
            (x.wrapping_sub(1), y),
            (x + 1, y),
            (x, y.wrapping_sub(1)),
            (x, y + 1),
        ] {
            if nx < w && ny < h && !seen[ny * w + nx] && spreads(nx, ny) {
                seen[ny * w + nx] = true;
                stack.push((nx, ny));
            }
        }
    }
    let seams = trim_seam(img, labels, w, h, &seen, &index, board);
    erased + seams + sweep_pockets(img, labels, w, h, lattice)
}

/// Bolsas de damero que la inundación no alcanzó, juzgadas por lo que son.
///
/// Un rincón de fondo que el dibujo deja casi cercado —entre dos púas, contra el
/// borde de la imagen— no llega a tener dos vecinas confirmadas, así que su tono
/// sale por alternancia desde lejos y a veces sale del revés; entonces no cuadra
/// con nada y se queda. Aquí se miran esos restos como manchas conexas y no como
/// casillas: lo que distingue al damero de un plano del dibujo es que **trae los
/// dos tonos**, y eso una mancha lo dice por sí sola, sin rejilla de por medio.
///
/// Se le pide además tocar algo ya borrado, para que sea el mismo fondo y no un
/// dibujo aparte, y no pasar de unas pocas casillas: si algo grande ha
/// sobrevivido a todo lo anterior, es que la detección no iba fina y es mejor
/// dejarlo que adivinar.
fn sweep_pockets(
    img: &mut RgbaImage,
    labels: &[u8],
    w: usize,
    h: usize,
    lattice: &Lattice,
) -> usize {
    let cap = (lattice.cell.0 * lattice.cell.1 * POCKET_CELLS) as usize;
    let opaque = |img: &RgbaImage, x: usize, y: usize| img.get_pixel(x as u32, y as u32).0[3] != 0;

    let mut seen = vec![false; w * h];
    let mut erased = 0;
    for start in 0..w * h {
        let (sx, sy) = (start % w, start / w);
        if seen[start] || labels[start] > 1 && labels[start] != MIX || !opaque(img, sx, sy) {
            continue;
        }

        let mut mancha = Vec::new();
        let mut tones = [0usize; 2];
        let mut touches = false;
        let mut stack = vec![(sx, sy)];
        seen[start] = true;
        while let Some((x, y)) = stack.pop() {
            mancha.push((x, y));
            if labels[y * w + x] < 2 {
                tones[labels[y * w + x] as usize] += 1;
            }
            for (nx, ny) in [
                (x.wrapping_sub(1), y),
                (x + 1, y),
                (x, y.wrapping_sub(1)),
                (x, y + 1),
            ] {
                if nx >= w || ny >= h {
                    continue;
                }
                // Tocar un píxel ya transparente es tocar el fondo de verdad.
                if !opaque(img, nx, ny) {
                    touches = true;
                } else if !seen[ny * w + nx]
                    && (labels[ny * w + nx] < 2 || labels[ny * w + nx] == MIX)
                {
                    seen[ny * w + nx] = true;
                    stack.push((nx, ny));
                }
            }
        }

        let clean = tones[0] + tones[1];
        let both = clean > 0 && tones[0].min(tones[1]) as f64 >= clean as f64 * POCKET_BALANCE;
        if !touches || !both || mancha.len() > cap {
            continue;
        }
        for (x, y) in mancha {
            img.get_pixel_mut(x as u32, y as u32).0[3] = 0;
            erased += 1;
        }
    }
    erased
}

/// Borra la raya de un píxel que queda en la costura entre dos casillas.
///
/// El paso de la rejilla se ajusta a centésimas de píxel, así que la línea que
/// separa dos casillas cae medio píxel a un lado o a otro y la primera fila de
/// la casilla nueva conserva a veces el tono de la vieja. Sobrevive a la
/// inundación —no cuadra con su casilla ni es mezcla— y deja una malla con el
/// paso del damero, que es justo lo que despista después a `grid::detect`.
///
/// Se hace en una pasada aparte y sin propagar: el píxel se borra por estar
/// pegado a uno borrado **del otro lado de la costura**, y no sirve para
/// alcanzar al siguiente. Con propagación se colaría por la costura hasta
/// dentro de un plano del dibujo del mismo tono.
fn trim_seam(
    img: &mut RgbaImage,
    labels: &[u8],
    w: usize,
    h: usize,
    seen: &[bool],
    index: &impl Fn(usize, usize) -> usize,
    board: &Board,
) -> usize {
    let mut erased = 0;
    for y in 0..h {
        for x in 0..w {
            if seen[y * w + x] || labels[y * w + x] > 1 {
                continue;
            }
            let cell = index(x, y);
            let seam = [
                (x.wrapping_sub(1), y),
                (x + 1, y),
                (x, y.wrapping_sub(1)),
                (x, y + 1),
            ]
            .into_iter()
            .any(|(nx, ny)| {
                nx < w
                    && ny < h
                    && seen[ny * w + nx]
                    && index(nx, ny) != cell
                    && labels[y * w + x] == board.tone[index(nx, ny)]
            });
            if seam {
                img.get_pixel_mut(x as u32, y as u32).0[3] = 0;
                erased += 1;
            }
        }
    }
    erased
}
