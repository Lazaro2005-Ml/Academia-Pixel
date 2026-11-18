"""Pruebas de API, persistencia, revisión docente, archivos y salas en tiempo real.
Ejecutar desde raíz: python -m unittest discover -s tests -v
"""
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

TMP = tempfile.TemporaryDirectory(prefix='academia_pixel_test_')
os.environ['ACADEMIA_DATA_DIR'] = TMP.name
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import app, db  # noqa: E402

class API(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        TMP.cleanup()

    def test_complete_flow(self):
        c=self.client
        a=c.post('/api/auth/register',json={'username':'Estudiante1','password':'Contraseña123'})
        self.assertEqual(a.status_code,200,a.text)
        cookie1=a.cookies.get('academia_session')
        self.assertTrue(cookie1)
        self.assertNotIn('password',a.text)
        self.assertEqual(c.post('/api/auth/register',json={'username':'estudiante1','password':'Contraseña123'}).status_code,409)
        self.assertEqual(c.post('/api/auth/login',json={'username':'Estudiante1','password':'incorrecta'}).status_code,401)
        subjects=c.get('/api/subjects',cookies={'academia_session':cookie1}).json()
        self.assertEqual(len(subjects),4)
        self.assertEqual(sorted(x['question_count'] for x in subjects),[10,10,10,20])
        self.assertEqual(c.get('/api/teacher/pending',cookies={'academia_session':cookie1}).status_code,403)
        # Sesión de 10 preguntas; nadie puede puntuar dos veces después de terminar.
        started=c.post('/api/sessions',json={'subject':'Programacion'},cookies={'academia_session':cookie1}).json()
        self.assertEqual(started['total'],10)
        self.assertNotIn('answer',started['question'])
        r=None
        for _ in range(10):
            r=c.post('/api/sessions/'+started['session']+'/answer',json={'option':'respuesta inventada'},cookies={'academia_session':cookie1})
            self.assertEqual(r.status_code,200,r.text)
        self.assertTrue(r.json()['finished'])
        self.assertEqual(r.json()['score'],0)
        self.assertEqual(c.post('/api/sessions/'+started['session']+'/answer',json={'option':'xx'},cookies={'academia_session':cookie1}).status_code,409)
        self.assertEqual(len(c.get('/api/history',cookies={'academia_session':cookie1}).json()),1)
        rank=c.get('/api/ranking',cookies={'academia_session':cookie1}).json()
        self.assertEqual(rank[0]['name'],'Estudiante1')
        self.assertEqual(rank[0]['played'],1)
        # Material TXT y generación sin clave.
        notes=('La programación estructurada organiza instrucciones en funciones y procedimientos. '
               'La base de datos relacional utiliza tablas y claves para identificar registros. '
               'La normalización permite reducir redundancias y anomalías en el almacenamiento de datos. '
               'Los algoritmos ordenan operaciones para solucionar problemas mediante pasos definidos. ')*4
        upload=c.post('/api/materials',data={'subject':'Mi materia','text':notes},cookies={'academia_session':cookie1})
        self.assertEqual(upload.status_code,200,upload.text)
        m=upload.json()
        generated=c.post('/api/materials/'+str(m['id'])+'/generate',json={'qty':4},cookies={'academia_session':cookie1})
        self.assertEqual(generated.status_code,200,generated.text)
        self.assertTrue(len(generated.json()['questions'])>=1)
        self.assertIn('sin IA',generated.json()['mode'])
        self.assertIn('Mi materia',[x['name'] for x in c.get('/api/subjects',cookies={'academia_session':cookie1}).json()])
        self.assertEqual(c.post('/api/sessions',json={'subject':m['subject']},cookies={'academia_session':cookie1}).status_code,200)
        # DOCX real.
        from docx import Document
        doc=Document(); doc.add_paragraph(notes)
        bio=io.BytesIO();doc.save(bio)
        upload2=c.post('/api/materials',data={'subject':'Base de Datos'}, files={'file':('estudio.docx',bio.getvalue(),'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},cookies={'academia_session':cookie1})
        self.assertEqual(upload2.status_code,200,upload2.text)
        self.assertEqual(c.post('/api/materials',data={'subject':'A'},files={'file':('bad.exe',b'abc','application/octet-stream')},cookies={'academia_session':cookie1}).status_code,400)
        self.assertEqual(c.post('/api/materials',data={'subject':'A'},files={'file':('huge.txt',b'x'*6_000_000,'text/plain')},cookies={'academia_session':cookie1}).status_code,413)
        # Docente se crea elevando rol desde un proceso administrativo.
        with db() as dbcon: dbcon.execute("UPDATE users SET role='teacher' WHERE username='Estudiante1'")
        pending=c.get('/api/teacher/pending',cookies={'academia_session':cookie1})
        self.assertEqual(pending.status_code,200,pending.text)
        question_id=pending.json()[0]['id']
        self.assertEqual(c.post('/api/teacher/review/'+str(question_id),json={'decision':'approved'},cookies={'academia_session':cookie1}).status_code,200)
        self.assertEqual(c.post('/api/teacher/review/'+str(question_id),json={'decision':'approved'},cookies={'academia_session':cookie1}).status_code,404)
        # Escenario de dos jugadores con distintas cuentas y sala compartida.
        a2=c.post('/api/auth/register',json={'username':'JugadorDos','password':'Otraclave123'})
        self.assertEqual(a2.status_code,200,a2.text)
        cookie2=a2.cookies.get('academia_session')
        with c.websocket_connect('/ws/online',cookies={'academia_session':cookie1},headers={'origin':'http://testserver'}) as ws1:
            ws1.send_json({'type':'create','subject':'Programacion'})
            info1=ws1.receive_json()
            self.assertEqual(info1['type'],'room_state')
            roomcode=info1['code']
            with c.websocket_connect('/ws/online',cookies={'academia_session':cookie2},headers={'origin':'http://testserver'}) as ws2:
                ws2.send_json({'type':'join','code':roomcode})
                info2=ws2.receive_json();self.assertEqual(len(info2['players']),2)
                info1=ws1.receive_json();self.assertEqual(len(info1['players']),2)
                ws1.send_json({'type':'start'})
                startstate1=ws1.receive_json();startstate2=ws2.receive_json()
                self.assertEqual(startstate1['status'],'playing')
                self.assertEqual(startstate2['status'],'playing')
                q1=ws1.receive_json();q2=ws2.receive_json()
                for i in range(10):
                    self.assertEqual(q1['question']['id'],q2['question']['id'])
                    # Ambos responden cada ronda.
                    ws1.send_json({'type':'answer','option':'incorrecta'})
                    self.assertEqual(ws1.receive_json()['type'],'answered')
                    ws2.send_json({'type':'answer','option':'incorrecta'})
                    self.assertEqual(ws2.receive_json()['type'],'answered')
                    self.assertEqual(ws1.receive_json()['type'],'round_result')
                    self.assertEqual(ws2.receive_json()['type'],'round_result')
                    if i<9:
                        q1=ws1.receive_json();q2=ws2.receive_json()
                finish1=ws1.receive_json();finish2=ws2.receive_json()
                self.assertEqual(finish1['type'],'finished')
                self.assertEqual(finish2['type'],'finished')
        self.assertEqual(len(c.get('/api/history',cookies={'academia_session':cookie2}).json()),1)
        self.assertEqual(c.get('/api/history',cookies={'academia_session':cookie2}).json()[0]['mode'],'online')
        self.assertEqual(c.get('/').status_code,200)
        self.assertEqual(c.get('/js/game.js').status_code,200)
        # Cliente Android: otro origen, token Bearer y WebSocket autenticado
        # sin cookie; los tokens no van en la URL WebSocket.
        with TestClient(app) as native:
            token = a2.json()['token']
            res = native.get('/api/me',headers={'Authorization':'Bearer '+token,'Origin':'http://localhost'})
            self.assertEqual(res.status_code,200,res.text)
            self.assertEqual(res.json()['username'],'JugadorDos')
            self.assertEqual(res.headers.get('access-control-allow-origin'),'http://localhost')
            disallowed = native.get('/api/me',headers={'Authorization':'Bearer '+token,'Origin':'https://sitio-malicioso.example'})
            self.assertNotIn('access-control-allow-origin',disallowed.headers)
            with native.websocket_connect('/ws/online',headers={'origin':'http://localhost'}) as mobile_ws:
                mobile_ws.send_json({'type':'auth','token':token})
                self.assertEqual(mobile_ws.receive_json()['type'],'auth_ok')
                mobile_ws.send_json({'type':'create','subject':'Programacion'})
                self.assertEqual(mobile_ws.receive_json()['type'],'room_state')
                mobile_ws.send_json({'type':'leave'})
                self.assertEqual(mobile_ws.receive_json()['type'],'left')
        self.assertEqual(c.get('/api/health').json()['ok'],True)

if __name__=='__main__': unittest.main()
