from __future__ import annotations

from collections.abc import Callable


def golden_section_minimize(
    f: Callable[[float], float],
    a: float,
    b: float,
    *,
    tol: float = 1e-5,
    max_iter: int = 80,
) -> tuple[float, float]:
    """Minimize unimodal f on [a,b] without derivatives. Returns (x_min, f_min)."""
    phi = (1 + 5**0.5) / 2
    inv_phi = 1 / phi
    c = b - (b - a) * inv_phi
    d = a + (b - a) * inv_phi
    fc, fd = f(c), f(d)
    for _ in range(max_iter):
        if abs(b - a) < tol * (abs(c) + abs(d) + 1.0):
            break
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - (b - a) * inv_phi
            fc = f(c)
        else:
            a, c, fc = c, d, fd
            d = a + (b - a) * inv_phi
            fd = f(d)
    x = (a + b) / 2
    return x, f(x)
