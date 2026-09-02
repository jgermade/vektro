//! Representación intermedia entre segmentar y ajustar.
//!
//! La segmentación produce regiones; el ajuste convierte sus contornos en datos
//! de `<path>`. Entre medias va esto, y su forma decide si el ajuste puede o no
//! resolver las costuras.
//!
//! El contorno **no** se guarda como bucles independientes por región, sino como
//! tramos con una región a cada lado ([`HalfEdge`]). Con bucles independientes,
//! una frontera compartida por dos regiones se ajustaría dos veces, con
//! resultados distintos, y entre ellas asomaría un pelo de fondo; con tramos
//! compartidos se ajusta una vez y el problema no existe. Con `h`/`v` sobre
//! coordenadas enteras eso da igual, pero con Béziers no, y el tipo tiene que
//! estar antes de escribir los ajustadores.
//!
//! Las dos segmentaciones lo rellenan, y las dos por el mismo sitio
//! ([`crate::boundary`]): se etiqueta cada píxel con su región y se recorren las
//! grietas una sola vez. El clustering además lo necesita para saber en qué
//! vecina fundir una mota.

use std::collections::HashMap;

use crate::color::Rgba;
use crate::trace::Point;

pub type RegionId = usize;
pub type EdgeId = usize;

/// Un tramo de frontera, orientado de forma que `left` queda a su izquierda.
#[derive(Clone, Debug)]
pub struct HalfEdge {
    /// Polilínea densa, sin simplificar: el ajuste necesita todos los puntos
    /// para estimar tangentes, y el ajustador `pixel` ya se encarga de colapsar
    /// los tramos rectos.
    ///
    /// Incluye **los dos extremos**, y un tramo cerrado repite el primero al
    /// final. Esa repetición es la señal de que el tramo se cierra sobre sí
    /// mismo, que es justo lo que un ajustador de curvas necesita saber para
    /// tratarlo como periódico en vez de dejarle dos puntas sueltas.
    pub points: Vec<Point>,
    /// Desplazamiento subpíxel de cada punto, paralelo a `points`, o **vacío** si
    /// esta segmentación no lo calcula. Ver [`crate::subpixel`].
    ///
    /// Va aquí y no dentro de `points` porque la retícula sigue siendo la verdad
    /// de la topología: quién toca a quién, qué anillo encierra a cuál y en qué
    /// vecina se funde una mota se deciden sobre enteros y no deben depender de
    /// esto. El desplazamiento es sólo para dibujar.
    pub offsets: Vec<(f32, f32)>,
    pub left: RegionId,
    /// La región del otro lado, o `None` si al otro lado está el exterior.
    pub right: Option<RegionId>,
}

impl HalfEdge {
    /// Los puntos ya desplazados. Sin desplazamientos son los de la retícula.
    pub fn placed(&self) -> Vec<crate::fit::Pt> {
        if self.offsets.is_empty() {
            return self
                .points
                .iter()
                .map(|&(x, y)| (x.into(), y.into()))
                .collect();
        }
        self.points
            .iter()
            .zip(&self.offsets)
            .map(|(&(x, y), &(dx, dy))| {
                (f64::from(x) + f64::from(dx), f64::from(y) + f64::from(dy))
            })
            .collect()
    }
}

/// Un anillo cerrado, como secuencia de tramos. El `bool` marca que el tramo se
/// recorre al revés, que es lo que pasa cuando se comparte con la región vecina.
pub type Ring = Vec<(EdgeId, bool)>;

#[derive(Clone, Debug)]
pub struct Region {
    pub color: Rgba,
    /// Píxeles que ocupa. El filtrado de motas se apoya en esto.
    pub area: usize,
    /// Anillos del contorno: el exterior y los agujeros, todos con el mismo
    /// trato porque se rellenan con `fill-rule="evenodd"`.
    pub rings: Vec<Ring>,
}

/// Un grupo de bandas fundido en una sola figura con degradado lineal.
///
/// No es una [`Region`] con otro relleno: **no tiene un color**, y darle uno
/// falso para que el vector siguiera siendo homogéneo sería mentir en el tipo.
/// Lo que comparte con una región es lo único que hace falta para dibujarla, que
/// son sus anillos. Quien los encuentra es `crate::ramp`, que sólo existe con la
/// segmentación por clustering; el tipo vive aquí, con el resto de lo que se
/// dibuja, porque es a [`crate::svg`] a quien le toca saber pintarlo.
#[derive(Clone, Debug)]
pub struct Ramp {
    /// Contorno de la unión de las bandas, con sus agujeros, igual que en una
    /// región y con el mismo `fill-rule`.
    pub rings: Vec<Ring>,
    /// Cómo se pasa de una posición del lienzo a la altura del degradado.
    pub axis: Axis,
    /// Paradas en orden, cada una con su posición en `0..1` sobre ese eje.
    pub stops: Vec<(f64, Rgba)>,
    /// Bandas que sustituye. No hace falta para dibujar; se informa.
    pub bands: usize,
}

/// La geometría de un degradado: qué función de la posición es su altura.
///
/// Son dos y no una porque un `<linearGradient>` sólo sabe expresar el color como
/// función de la proyección sobre **un eje**, y hay sombreados que no lo son: el
/// terminador de una superficie redonda —la barriga de un dibujo, una esfera— es
/// una función de la **distancia a un centro**, y forzarle un eje lo embadurna en
/// una dirección que no existe. Cada una se emite con su elemento.
#[derive(Clone, Copy, Debug)]
pub enum Axis {
    /// La altura es la proyección sobre la recta que va de `from` a `to`.
    Linear { from: (f64, f64), to: (f64, f64) },
    /// La altura es la distancia a `center`, partida por `radius`.
    Radial { center: (f64, f64), radius: f64 },
}

/// Lo que devuelve la segmentación.
///
/// Las regiones vienen **en orden de emisión**: las del mismo color seguidas, y
/// los colores más presentes primero, de modo que los paths grandes queden al
/// fondo del documento.
#[derive(Clone, Debug)]
pub struct Regions {
    /// Tamaño del lienzo en las unidades en que están los puntos.
    pub width: usize,
    pub height: usize,
    /// Colores distintos encontrados. No tiene por qué coincidir con los que
    /// acaben emitiéndose: un color cuyos bloques no den contorno no deja
    /// región, pero sí estaba en la imagen.
    pub colors: usize,
    pub regions: Vec<Region>,
    /// Los degradados encontrados, si se buscaron. Las regiones que cada uno se
    /// llevó **ya no están** en `regions`.
    pub ramps: Vec<Ramp>,
    pub edges: Vec<HalfEdge>,
    /// A dónde ha ido a parar cada región de las que nombran los tramos, o
    /// **vacío** si nadie las ha movido, que quiere decir la identidad.
    ///
    /// Los `left`/`right` de un tramo se fijan al segmentar y ya no cambian,
    /// pero `regions` sí: fundir un grupo de bandas en un degradado
    /// ([`crate::ramp::merge`]) las saca de la lista y corre los índices de las
    /// que quedan. Sin esta tabla, quien lea un tramo después de eso estaría
    /// mirando otra región —o una que ya no está—, que es justo el error que no
    /// se ve hasta que el dibujo sale con los colores cambiados.
    pub moved: Vec<Moved>,
}

/// Dónde acabó una región de las que nombran los tramos.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Moved {
    /// Sigue dibujándose por su cuenta, ahora en `regions[.0]`.
    Region(RegionId),
    /// Se la llevó `ramps[.0]`, y ya no se dibuja aparte.
    Ramp(usize),
}

impl Regions {
    /// Encadena los puntos de un anillo tal como salieron de la segmentación.
    pub fn ring_points(&self, ring: &Ring) -> Vec<Point> {
        chain(ring, |edge| self.edges[edge].points.as_slice())
    }

    /// Qué se dibuja hoy al lado de un tramo que nombra a `id`, o `None` si por
    /// ahí no hay nada: el exterior, o lo transparente.
    ///
    /// Se le pasa el `right` de un tramo tal cual, que ya es `Option`, y el
    /// `left` envuelto en `Some`: los dos lados se preguntan igual.
    pub fn drawn_at(&self, id: Option<RegionId>) -> Option<Moved> {
        let id = id?;
        if self.moved.is_empty() {
            return Some(Moved::Region(id));
        }
        self.moved.get(id).copied()
    }
}

/// Lo que hace falta saber de un elemento de cadena para poder ensamblarlo.
///
/// Existe para que [`chain`] valga tanto para los puntos que salen de la
/// segmentación como para los vértices con tangentes que produce el ajuste de
/// curvas, sin escribir dos veces la regla de qué se repite y dónde. Es un rato
/// sutil, y tenerla dos veces es exactamente como se estropea.
pub trait Chainable: Copy {
    /// El mismo elemento recorrido en sentido contrario. Para un punto es él
    /// mismo; para un vértice, sus dos controles cambian de lado.
    fn reversed(self) -> Self;

    /// Funde los dos elementos que coinciden en una junta: `self` es el que ya
    /// está puesto —el final del tramo anterior— y `next` el primero del
    /// siguiente, que ocupa el mismo sitio. De uno viene lo que llega a la
    /// junta y del otro lo que sale.
    fn join(self, next: Self) -> Self;

    /// Si los dos ocupan el mismo sitio, controles aparte.
    fn same_place(self, other: Self) -> bool;
}

impl Chainable for Point {
    fn reversed(self) -> Self {
        self
    }

    fn join(self, _next: Self) -> Self {
        self
    }

    fn same_place(self, other: Self) -> bool {
        self == other
    }
}

/// Encadena los tramos de un anillo. El primer elemento no se repite al final:
/// el cierre es implícito.
///
/// Los tramos llegan por parámetro en vez de leerse de `edges` porque el ajuste
/// ensambla los suyos, que son otros ([`crate::fit::Fitted`]). La regla de qué
/// se repite y dónde vive aquí, en un solo sitio, y no una vez por ajustador.
pub fn chain<'a, T: Chainable + 'a>(ring: &Ring, items: impl Fn(EdgeId) -> &'a [T]) -> Vec<T> {
    let mut out: Vec<T> = Vec::new();
    for &(edge, reversed) in ring {
        let edge = items(edge);
        let mut it: Box<dyn Iterator<Item = T> + '_> = if reversed {
            Box::new(edge.iter().rev().map(|v| v.reversed()))
        } else {
            Box::new(edge.iter().copied())
        };
        // El primer elemento de un tramo es el último del anterior: son el
        // mismo sitio visto desde los dos lados, y se funden en uno.
        if let Some(prev) = out.last_mut() {
            if let Some(first) = it.next() {
                *prev = prev.join(first);
            }
        }
        out.extend(it);
    }
    // Y el final del anillo es otra vez su principio, porque el tramo que lo
    // cierra acaba donde empezó el primero.
    if out.len() > 1 && out[out.len() - 1].same_place(out[0]) {
        let last = out.pop().expect("acabamos de mirar que hay más de uno");
        out[0] = last.join(out[0]);
    }
    out
}

/// Reparte los tramos de una cara en anillos cerrados.
///
/// «Cara» y no «región» a propósito: lo único que se le pide a `uses` es que sean
/// los tramos de una figura, cada uno orientado con la figura a su izquierda. Con
/// eso vale igual para el contorno de una región que para el de la **unión** de
/// varias —quitando los tramos que quedan por dentro—, que es de lo que vive
/// [`crate::ramp`] y por lo que fundir un grupo de bandas no necesita ni un
/// recorte de polígonos.
pub fn rings(edges: &[HalfEdge], uses: &[(EdgeId, bool)]) -> Vec<Ring> {
    let mut by_start: HashMap<Point, Vec<usize>> = HashMap::new();
    for (i, &u) in uses.iter().enumerate() {
        by_start.entry(start_of(edges, u)).or_default().push(i);
    }

    let mut done = vec![false; uses.len()];
    let mut out = Vec::new();
    for seed in 0..uses.len() {
        if done[seed] {
            continue;
        }
        let mut ring: Ring = Vec::new();
        let opening = start_of(edges, uses[seed]);
        let mut i = seed;
        loop {
            done[i] = true;
            ring.push(uses[i]);
            let end = end_of(edges, uses[i]);
            // El anillo se cierra al volver a donde empezó, y ahí se corta aunque
            // queden tramos sin usar que salgan de este mismo punto. Seguir
            // enganchándolos daría un anillo en forma de ocho: es lo que pasa con
            // dos trozos de la misma región que sólo se tocan por una esquina, que
            // son dos cadenas cerradas distintas y las dos empiezan y acaban ahí.
            // El relleno par-impar pintaría igual el ocho, pero cada trozo tiene
            // que ser su propio anillo para que un ajustador de curvas pueda
            // cerrar cada uno por su cuenta.
            if end == opening {
                break;
            }
            let incoming = last_step(edges, uses[i]);
            // En una esquina donde la región se toca consigo misma salen dos
            // continuaciones. Se prefiere el giro más cerrado a la izquierda,
            // igual que en `trace::pick_next`: eso separa los píxeles que sólo se
            // tocan en diagonal en anillos distintos, que es lo que hace que el
            // relleno par-impar los pinte bien.
            let next = by_start.get(&end).and_then(|candidates| {
                candidates
                    .iter()
                    .copied()
                    .filter(|&c| !done[c])
                    .min_by_key(|&c| turn(incoming, first_step(edges, uses[c])))
            });
            match next {
                Some(next) => i = next,
                // No debería pasar: el contorno de una cara son curvas cerradas,
                // así que desde cualquier tramo se vuelve al principio.
                None => {
                    debug_assert!(false, "anillo abierto en {end:?}");
                    break;
                }
            }
        }
        out.push(ring);
    }
    out
}

fn start_of(edges: &[HalfEdge], (edge, reversed): (EdgeId, bool)) -> Point {
    let points = &edges[edge].points;
    if reversed {
        points[points.len() - 1]
    } else {
        points[0]
    }
}

fn end_of(edges: &[HalfEdge], (edge, reversed): (EdgeId, bool)) -> Point {
    let points = &edges[edge].points;
    if reversed {
        points[0]
    } else {
        points[points.len() - 1]
    }
}

/// El primer paso del tramo tal como se recorre.
fn first_step(edges: &[HalfEdge], (edge, reversed): (EdgeId, bool)) -> Point {
    let points = &edges[edge].points;
    let n = points.len();
    if reversed {
        delta(points[n - 1], points[n - 2])
    } else {
        delta(points[0], points[1])
    }
}

/// El último paso del tramo tal como se recorre.
fn last_step(edges: &[HalfEdge], (edge, reversed): (EdgeId, bool)) -> Point {
    let points = &edges[edge].points;
    let n = points.len();
    if reversed {
        delta(points[1], points[0])
    } else {
        delta(points[n - 2], points[n - 1])
    }
}

fn delta(a: Point, b: Point) -> Point {
    (b.0 - a.0, b.1 - a.1)
}

/// Cuánto gira una continuación respecto a lo que se traía: la izquierda
/// primero. Mismo criterio que [`crate::trace`].
fn turn(incoming: Point, outgoing: Point) -> u8 {
    let left = (incoming.1, -incoming.0);
    let right = (-incoming.1, incoming.0);
    if outgoing == left {
        0
    } else if outgoing == incoming {
        1
    } else if outgoing == right {
        2
    } else {
        3
    }
}
