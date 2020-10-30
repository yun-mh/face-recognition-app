import boto3
import base64
import json
import numpy as np
import logging
import traceback,sys
from chalice import Chalice

app = Chalice(app_name='image-classification-yun')
app.debug = True

logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

@app.route('/rekognition', methods=['POST'], content_types=['application/octet-stream'], cors=True)
def rekognition():

    try:
        # リクエストからイメージデータを取得
        body_data = app.current_request.raw_body
        body_data = body_data.split(b'base64,')

        image = base64.b64decode(body_data[1])

        # rekognitionクライアントの生成
        rekognition_client = boto3.client('rekognition', region_name='ap-northeast-1')
        
        # イメージから保護装備の検知(マスク検知)
        logger.info('Invoke Rekognition - Detecting PPE')
        ppe_res = rekognition_client.detect_protective_equipment(
                        Image = {'Bytes': image },
                        SummarizationAttributes = {'MinConfidence': 98, 'RequiredEquipmentTypes': ['FACE_COVER'] }
                    )
        
        # イメージから顔の検知            
        logger.info('Invoke Rekognition - Detecting faces')
        face_res = rekognition_client.detect_faces(
                        Image = {'Bytes': image },
                        Attributes = ["ALL"]
                    )
        
        # 取得した複数の顔データを精度が高い順に整列し、一番精度が高い顔だけ利用する
        face_res['FaceDetails'].sort(reverse=True, key=lambda k: k['Confidence'])
        res = face_res['FaceDetails'][0]

        # 保護装備の結果からマスクに該当するものを取り、顔検知のレスポンスに付加する
        body_parts = ppe_res['Persons'][0]['BodyParts']
        equipment = [el['EquipmentDetections'] for el in body_parts if el['Name'] == 'FACE']
        
        # レスポンスにMaskプロパティをFalseとして追加し、マスクのデータが存在したらデータをくっつける
        res['Mask'] = False
        try:
            # 精度が98以上のみ設定する
            if equipment[0][0]['Confidence'] > 98:
                res['Mask'] = equipment[0][0]
        except:
            # 元のマスクデータがないため、Falseとして処理するために例外をパスする
            pass

        # 最終結果をレスポンスとしてリターンする
        return res

    except Exception as e:
        tb = sys.exc_info()[2]
        return 'error:{0}'.format(e.with_traceback(tb))