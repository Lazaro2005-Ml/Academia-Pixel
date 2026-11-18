"""Uso: python crear_docente.py nombre_de_usuario (el usuario debe estar registrado)."""
import sys
from app import db
if len(sys.argv) != 2:
    raise SystemExit('Uso: python crear_docente.py usuario_registrado')
with db() as c:
    result = c.execute("UPDATE users SET role='teacher' WHERE username=?", (sys.argv[1],))
    if result.rowcount != 1: raise SystemExit('Ese usuario no existe. Registralo primero en el juego.')
print('Docente habilitado. Cerrá sesión y volvé a ingresar.')
