//! Extracción de eje central (*centerline*) y trazado de líneas (*stroke*).
//!
//! Transforma regiones cerradas muy finas (trazos de tinta, líneas de contorno) en
//! caminitos centrales abiertos con atributo `stroke` y `stroke-width` en el SVG,
//! evitando que se emitan como polígonos rellenos de doble contorno.

use crate::fit::Pt;

/// Comprueba si una región tiene topología de cinta/trazo fino.
///
/// `thickness = 2 * area / perimeter`. Si `thickness <= max_thickness`, la región
/// es candidata a extraerse como trazo.
pub fn is_ribbon(area: usize, perimeter: usize, max_thickness: f64) -> bool {
    if perimeter == 0 || area == 0 {
        return false;
    }
    let thickness = (2.0 * area as f64) / perimeter as f64;
    thickness > 0.0 && thickness <= max_thickness
}

/// Extrae el eje central y el grosor medio de una cadena cerrada de contorno fino.
pub fn extract_centerline(points: &[Pt]) -> Option<(Vec<Pt>, f64)> {
    let n = points.len();
    if n < 6 {
        return None;
    }

    let mut total_len = 0.0;
    let mut dists = Vec::with_capacity(n);
    dists.push(0.0);
    for i in 1..n {
        total_len += dist(points[i - 1], points[i]);
        dists.push(total_len);
    }

    if total_len == 0.0 {
        return None;
    }

    let mut center_pts = Vec::new();
    let mut width_sum = 0.0;
    let mut count = 0;

    let num_samples = n / 2;
    for i in 0..num_samples {
        let p1 = points[i];

        // Buscar el punto opuesto más cercano alrededor de la mitad opuesta del bucle
        let mut min_d = f64::INFINITY;
        let mut best_pt = points[(i + num_samples) % n];

        for &p2 in &points[num_samples..] {
            let d = dist(p1, p2);
            if d < min_d {
                min_d = d;
                best_pt = p2;
            }
        }

        let mid = ((p1.0 + best_pt.0) / 2.0, (p1.1 + best_pt.1) / 2.0);
        center_pts.push(mid);
        width_sum += min_d;
        count += 1;
    }

    if count == 0 || center_pts.len() < 2 {
        return None;
    }

    let avg_width = width_sum / count as f64;
    Some((center_pts, avg_width))
}

fn dist(a: Pt, b: Pt) -> f64 {
    let dx = a.0 - b.0;
    let dy = a.1 - b.1;
    (dx * dx + dy * dy).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_ribbon() {
        assert!(is_ribbon(100, 200, 3.0)); // thickness = 1.0 <= 3.0
        assert!(!is_ribbon(1000, 100, 3.0)); // thickness = 20.0 > 3.0
    }

    #[test]
    fn test_extract_centerline() {
        // Muestreo de una cinta rectangular de 10x1 (largo 10, grosor 1)
        let pts = vec![
            (0.0, 0.0),
            (2.5, 0.0),
            (5.0, 0.0),
            (7.5, 0.0),
            (10.0, 0.0),
            (10.0, 1.0),
            (7.5, 1.0),
            (5.0, 1.0),
            (2.5, 1.0),
            (0.0, 1.0),
        ];
        let res = extract_centerline(&pts);
        assert!(res.is_some());
        let (center, width) = res.unwrap();
        assert!(center.len() >= 2);
        assert!(width > 0.0 && width <= 2.0);
    }
}
