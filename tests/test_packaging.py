"""Pruebas estáticas de los empaquetados. No generan instaladores."""
import json
import unittest
from pathlib import Path
P=Path(__file__).resolve().parents[1]
class Packaging(unittest.TestCase):
    def test_electron_does_not_embed_backend(self):
        pkg=json.loads((P/'desktop/package.json').read_text())
        self.assertEqual(pkg['build']['win']['target'],['nsis'])
        self.assertEqual(pkg['build']['win']['artifactName'],'AcademiaPixel-Setup.${ext}')
        self.assertNotIn('extraResources',pkg['build'])
        js=(P/'desktop/main.cjs').read_text()
        self.assertIn('loadURL(origin)',js)
        self.assertNotIn('spawn(',js)
        self.assertIn("sandbox:true",js)
    def test_android_uses_bundled_frontend_and_https(self):
        cfg=json.loads((P/'android-app/capacitor.config.json').read_text())
        self.assertEqual(cfg['webDir'],'www')
        src=(P/'android-app/scripts/prepare-web.mjs').read_text()
        self.assertIn("url.protocol !== 'https:'",src)
        self.assertIn('serverLocked:true',src)
        native=(P/'android-app/scripts/after-add.mjs').read_text()
        self.assertIn('replace(/ android:usesCleartextTraffic=',native)
    def test_deployment(self):
        compose=(P/'deployment/compose.yaml').read_text()
        self.assertIn('COOKIE_SECURE: "1"',compose)
        self.assertIn('academia_data:/data',compose)
        self.assertIn('reverse_proxy api:8000',(P/'deployment/Caddyfile').read_text())
if __name__=='__main__':unittest.main()
