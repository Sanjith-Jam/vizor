"""Reproducible real inference on a recorded still-image video, with synthetic GPS.
The output is explicitly replay data and never enters the shared live hazard map.
Run after scripts/verify-backend.mjs using the model-assets Python environment.
"""
import base64,json,os,pty,select,sqlite3,subprocess,time,urllib.request
from pathlib import Path
import cv2
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
credentials=json.loads(Path('.tools/demo-session.json').read_text())
out=Path('output/recorded-demo');out.mkdir(parents=True,exist_ok=True)
image=cv2.imread('output/evaluation/india-pothole-source.jpg');assert image is not None
h,w=image.shape[:2];video=cv2.VideoWriter(str(out/'road-replay.avi'),cv2.VideoWriter_fourcc(*'MJPG'),10,(w,h))
with (out/'gps-imu.jsonl').open('w') as gps:
 for frame in range(1,121):
  video.write(image)
  gps.write(json.dumps({'frame':frame,'fix':True,'lat':12.973,'lon':77.601,'accuracyMeters':6,'imu':None})+'\n')
video.release()
master,slave=pty.openpty();serial_path=os.ttyname(slave)
env={**os.environ,'VIZOR_SUPABASE_URL':credentials['url'],'VIZOR_SUPABASE_ANON_KEY':credentials['key'],'VIZOR_DEVICE_TOKEN':credentials['device']['token'],'VIZOR_DEVICE_ID':credentials['device']['id'],'YOLO_AUTOINSTALL':'False'}
command=['vision-ai/model_assets/.venv/bin/python','vision-ai/bpi_inference.py','--model','output/models/rdd2022-yolov8n/best.pt','--camera',str(out/'road-replay.avi'),'--replay',str(out/'gps-imu.jsonl'),'--serial-port',serial_path,'--conf','.30','--imgsz','640','--area-threshold','200','--lane-margin','0','--headless','--events-out',str(out/'events.jsonl'),'--outbox',str(out/'outbox.sqlite3')]
with (out/'inference.log').open('w') as log:
 process=subprocess.Popen(command,env=env,stdout=log,stderr=subprocess.STDOUT)
 packets=b''
 while process.poll() is None:
  if select.select([master],[],[],.2)[0]:packets+=os.read(master,65536)
 while select.select([master],[],[],0)[0]:packets+=os.read(master,65536)
assert process.returncode==0,(out/'inference.log').read_text()
(out/'uart.txt').write_bytes(packets)
assert b'POTHOLE_ALERT:' in packets,'No real detector warning reached the simulated UART.'
assert b'GPS:12.973:77.601:1' in packets
# Flush any events that remained when video reached EOF; identical event IDs survive retries.
import sys
sys.path.insert(0,str(ROOT/'vision-ai'))
from edge_link import EdgeLink
os.environ.update({k:v for k,v in env.items() if k.startswith('VIZOR_')})
link=EdgeLink(str(out/'outbox.sqlite3'),False)
link.flush()
if link.evidence_path:link.request('telemetry',{'device_id':credentials['device']['id'],'camera':True,'gps':True,'fps':None,'latency_ms':None,'battery_percent':None,'source':'replay','evidence_path':link.evidence_path})
link.close()
def api(action,payload):
 req=urllib.request.Request(credentials['url']+'/functions/v1/api',json.dumps({'action':action,'payload':payload}).encode(),{'Content-Type':'application/json','apikey':credentials['key'],'Authorization':'Bearer '+credentials['session']['access_token']})
 return json.load(urllib.request.urlopen(req,timeout=15))
bounds={'south':12.97,'north':12.98,'west':77.60,'east':77.61}
replay=api('map',{'bounds':bounds,'replay':True})
events=[json.loads(line) for line in (out/'events.jsonl').read_text().splitlines()];assert events
assert all(e['observation']['source']=='replay' for e in events)
assert len(replay)>=len(events)
evidence=api('hazardEvidence',{'id':next(r['id'] for r in replay if r.get('evidence_path'))});assert evidence and evidence[0]['evidence_path']
url=api('evidence',{'path':evidence[0]['evidence_path']})['signedUrl'];assert urllib.request.urlopen(credentials['url']+url if url.startswith('/') else url).status==200
report={'passed':True,'input':'120-frame MJPEG recording made from a real RDD2022 Indian road image; synthetic GPS, no IMU','model':'pinned YOLOv8n,640,confidence=.30','observations':len(events),'uart_warning':True,'private_replay_map':True,'private_evidence_download':True,'limits':'Synthetic fixed GPS; area/lane gates relaxed for this fixture. No physical UART/OLED/ESP32/Banana Pi tested.'}
(out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
