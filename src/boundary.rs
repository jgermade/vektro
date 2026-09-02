//! De la imagen etiquetada a la representación intermedia de medias aristas.
//!
//! El clustering ([`crate::cluster`]) deja una etiqueta de región por píxel. Esto
//! saca de ahí los contornos, con **cada frontera una sola vez** y sabiendo qué
//! región queda a cada lado, que es lo que pide [`crate::region`].
//!
//! # Por qué no sirve el trazado de la rejilla
//!
//! [`crate::trace::trace`] traza una máscara: se le da un conjunto de píxeles y
//! devuelve sus bucles. Para usarlo hay que llamarlo una vez por región, con una
//! máscara del tamaño de la imagen cada vez —que es lo que hace
//! [`crate::segment::from_pixel_map`]—, y con decenas de miles de regiones eso no
//! termina. Y aunque terminara, cada región se trazaría por su cuenta: la
//! frontera entre dos vecinas saldría dos veces, y no habría dónde anotar quién
//! está al otro lado.
//!
//! # Grietas, nodos y cadenas
//!
//! Se mira la retícula de esquinas de píxel, `(w+1) x (h+1)`. Cada **grieta** es
//! un segmento unidad entre dos esquinas contiguas, y separa dos píxeles; es
//! frontera si los dos no tienen la misma etiqueta. El exterior y lo
//! transparente cuentan como una etiqueta más, así que el borde de la imagen sale
//! solo.
//!
//! Las grietas de frontera forman un grafo plano sobre la retícula, donde cada
//! esquina tiene grado 0, 2, 3 o 4 —nunca 1, porque las diferencias de etiqueta
//! forman curvas cerradas—. Las de grado 3 o 4 son **nodos**: ahí se juntan tres
//! o cuatro regiones y la frontera se bifurca. Entre nodo y nodo va una
//! **cadena**, y una cadena es exactamente una media arista.
//!
//! Lo que hace que esto funcione es que **en una esquina de grado 2 las dos
//! grietas separan el mismo par de regiones**, sigan recto o giren. Se comprueba
//! por casos: si de las cuatro grietas de la esquina sólo dos son frontera, las
//! otras dos tienen iguales sus dos píxeles, y eso obliga a que los tres o cuatro
//! píxeles de alrededor sean sólo dos valores distintos, repartidos justo de la
//! forma que deja el mismo par a un lado y a otro. Por eso una cadena tiene un
//! par `(left, right)` bien definido en toda su longitud, y por eso se puede
//! ajustar una sola vez para las dos caras. En depuración hay una comprobación
//! que lo verifica grieta a grieta, para que sea un hecho y no un argumento.

use crate::region::{self, EdgeId, HalfEdge, Ring};
use crate::trace::Point;

/// La etiqueta de un píxel que no es de ninguna región: lo transparente y todo
/// lo que queda fuera de la imagen.
///
/// Vive aquí y no en quien etiqueta porque hay dos que etiquetan —la rejilla y
/// el clustering— y esto es lo que las dos tienen que decir para que el
/// recorrido de grietas sepa dónde acaba el dibujo.
pub const NONE: u32 = u32::MAX;

/// Extrae los contornos de una imagen ya etiquetada: cada frontera una sola vez
/// y sabiendo qué etiqueta queda a cada lado.
///
/// Devuelve los tramos y, para cada etiqueta de `0..count`, sus anillos. Quién
/// es cada etiqueta —de qué color y cuánto ocupa— no se sabe aquí y lo pone
/// quien llama: esto es sólo la topología, y por eso sirve igual para las dos
/// segmentaciones.
pub fn from_labels(
    width: usize,
    height: usize,
    labels: &[u32],
    count: usize,
) -> (Vec<HalfEdge>, Vec<Vec<Ring>>) {
    let mut cracks = Cracks {
        w: width,
        h: height,
        labels,
        used: vec![false; width * (height + 1) + (width + 1) * height],
        node: vec![false; (width + 1) * (height + 1)],
    };
    cracks.mark_nodes();
    let edges = cracks.chains();
    let rings = assemble(&edges, count);
    (edges, rings)
}

/// Lo mismo a partir de un clustering, que es quien trae además los colores.
///
/// Las regiones salen en el mismo orden que traían las del clustering, que es el
/// de emisión: los colores más presentes primero y los de un color seguidos.
#[cfg(feature = "illustration")]
pub fn from_clustering(clustering: &crate::cluster::Clustering) -> crate::region::Regions {
    let (edges, rings) = from_labels(
        clustering.width,
        clustering.height,
        &clustering.labels,
        clustering.clusters.len(),
    );
    let regions = clustering
        .clusters
        .iter()
        .zip(rings)
        .map(|(cluster, rings)| crate::region::Region {
            color: cluster.color,
            area: cluster.area,
            rings,
        })
        .collect();
    crate::region::Regions {
        width: clustering.width,
        height: clustering.height,
        colors: clustering.colors,
        regions,
        // Los pone [`crate::ramp`] después, si se piden: aquí sólo se sabe de
        // grietas, y qué bandas son una rampa es una pregunta para los colores.
        ramps: Vec::new(),
        edges,
        // Nadie ha movido nada todavía: los `left`/`right` valen tal cual.
        moved: Vec::new(),
    }
}

/// Una grieta, por la esquina en la que empieza.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Crack {
    /// De `(x, y)` a `(x+1, y)`. Separa el píxel de arriba del de abajo.
    H(usize, usize),
    /// De `(x, y)` a `(x, y+1)`. Separa el de la izquierda del de la derecha.
    V(usize, usize),
}

struct Cracks<'a> {
    w: usize,
    h: usize,
    labels: &'a [u32],
    /// Las horizontales primero y las verticales después, en un solo vector.
    used: Vec<bool>,
    /// Esquinas donde la frontera se bifurca, es decir de grado 3 o 4.
    node: Vec<bool>,
}

impl<'a> Cracks<'a> {
    /// Marca las esquinas en las que la frontera se bifurca, que es donde hay
    /// que partir las cadenas.
    fn mark_nodes(&mut self) {
        let mut buf = [Crack::H(0, 0); 4];
        for ly in 0..=self.h {
            for lx in 0..=self.w {
                let degree = self.incident(lx, ly, &mut buf);
                self.node[ly * (self.w + 1) + lx] = degree > 2;
            }
        }
    }

    /// La etiqueta de un píxel. Fuera de la imagen es [`NONE`], igual que lo
    /// transparente: para el contorno el exterior no es un caso aparte.
    fn label(&self, x: i64, y: i64) -> u32 {
        if x < 0 || y < 0 || x >= self.w as i64 || y >= self.h as i64 {
            NONE
        } else {
            self.labels[y as usize * self.w + x as usize]
        }
    }

    /// Las etiquetas a izquierda y derecha de una grieta recorrida en su sentido
    /// creciente.
    ///
    /// Con la `y` hacia abajo, la izquierda de un avance `(dx, dy)` es `(dy, -dx)`:
    /// yendo en `+x` es el píxel de arriba, y yendo en `+y` el de la derecha.
    fn sides(&self, crack: Crack) -> (u32, u32) {
        match crack {
            Crack::H(x, y) => (
                self.label(x as i64, y as i64 - 1),
                self.label(x as i64, y as i64),
            ),
            Crack::V(x, y) => (
                self.label(x as i64, y as i64),
                self.label(x as i64 - 1, y as i64),
            ),
        }
    }

    fn is_boundary(&self, crack: Crack) -> bool {
        let (left, right) = self.sides(crack);
        left != right
    }

    fn ends(&self, crack: Crack) -> (Point, Point) {
        match crack {
            Crack::H(x, y) => ((x as i32, y as i32), (x as i32 + 1, y as i32)),
            Crack::V(x, y) => ((x as i32, y as i32), (x as i32, y as i32 + 1)),
        }
    }

    fn index(&self, crack: Crack) -> usize {
        match crack {
            Crack::H(x, y) => y * self.w + x,
            Crack::V(x, y) => self.w * (self.h + 1) + y * (self.w + 1) + x,
        }
    }

    /// Las grietas de frontera que tocan una esquina, y cuántas son.
    fn incident(&self, lx: usize, ly: usize, out: &mut [Crack; 4]) -> usize {
        let mut n = 0;
        let consider = |cracks: &Self, crack: Crack, out: &mut [Crack; 4], n: &mut usize| {
            if cracks.is_boundary(crack) {
                out[*n] = crack;
                *n += 1;
            }
        };
        if lx > 0 {
            consider(self, Crack::H(lx - 1, ly), out, &mut n);
        }
        if lx < self.w {
            consider(self, Crack::H(lx, ly), out, &mut n);
        }
        if ly > 0 {
            consider(self, Crack::V(lx, ly - 1), out, &mut n);
        }
        if ly < self.h {
            consider(self, Crack::V(lx, ly), out, &mut n);
        }
        n
    }

    fn is_node(&self, at: Point) -> bool {
        self.node[at.1 as usize * (self.w + 1) + at.0 as usize]
    }

    /// Todas las medias aristas de la imagen.
    fn chains(&mut self) -> Vec<HalfEdge> {
        let mut edges = Vec::new();
        // Primero las cadenas que van de nodo a nodo, porque es donde tienen que
        // partirse: sólo ahí cambia el par de regiones. Después lo que quede son
        // bucles que no pasan por ningún nodo —una región suelta sobre un fondo
        // uniforme no tiene por dónde bifurcarse— y se parten por donde caiga.
        self.sweep(true, &mut edges);
        self.sweep(false, &mut edges);
        edges
    }

    fn sweep(&mut self, only_nodes: bool, edges: &mut Vec<HalfEdge>) {
        let mut buf = [Crack::H(0, 0); 4];
        for ly in 0..=self.h {
            for lx in 0..=self.w {
                if only_nodes && !self.node[ly * (self.w + 1) + lx] {
                    continue;
                }
                let n = self.incident(lx, ly, &mut buf);
                for &crack in &buf[..n] {
                    if !self.used[self.index(crack)] {
                        let edge = self.walk((lx as i32, ly as i32), crack);
                        edges.push(edge);
                    }
                }
            }
        }
    }

    /// Sigue una cadena desde una esquina hasta el siguiente nodo, o hasta
    /// cerrarse sobre el punto de partida.
    fn walk(&mut self, start: Point, first: Crack) -> HalfEdge {
        // El par de regiones se fija con la primera grieta y vale para toda la
        // cadena. Si se entra por el extremo final de la grieta, los lados van
        // al revés que en su sentido creciente.
        let (left, right) = self.oriented(first, start);

        let mut points = vec![start];
        let mut buf = [Crack::H(0, 0); 4];
        let mut crack = first;
        let mut at = start;
        loop {
            debug_assert_eq!(
                self.oriented(crack, at),
                (left, right),
                "la cadena ha cambiado de par de regiones en {at:?}"
            );
            let index = self.index(crack);
            self.used[index] = true;
            let (a, b) = self.ends(crack);
            let next = if at == a { b } else { a };
            points.push(next);
            if next == start || self.is_node(next) {
                break;
            }
            // Grado 2: hay exactamente otra grieta, y es la continuación.
            let n = self.incident(next.0 as usize, next.1 as usize, &mut buf);
            debug_assert_eq!(n, 2, "esquina de grado {n} que no es nodo, en {next:?}");
            crack = if buf[0] == crack { buf[1] } else { buf[0] };
            at = next;
        }

        // `right` es el exterior, así que si lo transparente ha caído a la
        // izquierda hay que dar la vuelta a la cadena.
        let (left, right) = if left == NONE {
            points.reverse();
            (right, left)
        } else {
            (left, right)
        };
        HalfEdge {
            points,
            // Los pone [`crate::subpixel`] después, si se piden: aquí sólo se
            // sabe de grietas, y dónde cae el borde dentro de un píxel es una
            // pregunta para la imagen.
            offsets: Vec::new(),
            left: left as usize,
            right: (right != NONE).then_some(right as usize),
        }
    }

    /// Los lados de una grieta recorrida saliendo de `from`.
    fn oriented(&self, crack: Crack, from: Point) -> (u32, u32) {
        let (left, right) = self.sides(crack);
        if from == self.ends(crack).0 {
            (left, right)
        } else {
            (right, left)
        }
    }
}

/// Encadena las medias aristas de cada etiqueta en sus anillos.
///
/// Una región aparece como `left` de unas y como `right` de otras; en las
/// segundas su contorno recorre el tramo al revés, que es lo que marca el `bool`
/// del anillo. Al recorrerlas siempre en el sentido en que la región queda a la
/// izquierda, los anillos salen todos con la misma orientación.
fn assemble(edges: &[HalfEdge], count: usize) -> Vec<Vec<Ring>> {
    let mut uses: Vec<Vec<(EdgeId, bool)>> = vec![Vec::new(); count];
    for (id, edge) in edges.iter().enumerate() {
        uses[edge.left].push((id, false));
        if let Some(right) = edge.right {
            uses[right].push((id, true));
        }
    }

    uses.iter().map(|uses| region::rings(edges, uses)).collect()
}
