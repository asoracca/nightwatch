import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from nightwatch.video import probe, extract

class VideoTests(unittest.TestCase):
    def test_corrupt_file(self):
        with patch('subprocess.run',side_effect=subprocess.CalledProcessError(1,'ffprobe')):
            with self.assertRaises(ValueError):probe('corrupt')
    def test_missing_ffmpeg(self):
        with patch('subprocess.run',side_effect=FileNotFoundError):
            with self.assertRaisesRegex(ValueError,'not installed'):probe('clip')
    def test_zero_or_overlong(self):
        for duration in ['0','121','nan']:
            data={'streams':[{'codec_type':'video','avg_frame_rate':'30/1','width':640,'height':480}],
                  'format':{'duration':duration,'format_name':'mp4'}}
            with patch('subprocess.run',return_value=subprocess.CompletedProcess([],0,stdout=json.dumps(data))):
                with self.assertRaises(ValueError):probe('clip')
    def test_sampling(self):
        with tempfile.TemporaryDirectory() as tmp:
            def run(command,**kwargs):
                self.assertIn('fps=5:start_time=0',command[command.index('-vf')+1])
                for i in range(10): (Path(tmp)/f'{i+1:06}.jpg').touch()
            with patch('subprocess.run',side_effect=run):
                frames=extract('video',tmp,5,2)
                self.assertEqual(len(frames),10)
                self.assertEqual(frames[-1][1],1.8)
    def test_empty_extraction(self):
        with tempfile.TemporaryDirectory() as tmp,patch('subprocess.run'):
            with self.assertRaisesRegex(ValueError,'no decodable'):extract('empty',tmp,5,2)

if __name__=='__main__':unittest.main()
