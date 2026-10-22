"""Execute forecast templates offline with stub HTTP pages and a fixed KST clock."""
import contextlib
import copy
import datetime
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
REAL_DATETIME = datetime.datetime


class FixedDateTime(REAL_DATETIME):
    @classmethod
    def now(cls, tz=None):
        return cls(2026, 10, 22, 0, 20, tzinfo=tz)


class GeneratedForecastTests(unittest.TestCase):
    def execute_template(self, key):
        script = "import fs from 'node:fs'; import {pythonCode} from './js/code-generator.js'; const services=JSON.parse(fs.readFileSync('data/services.json')); process.stdout.write(pythonCode('GRID',{nx:60,ny:127},services[process.argv[1]]));"
        code = subprocess.check_output(['node', '--input-type=module', '-e', script, key], cwd=ROOT).decode('utf-8')
        calls = []

        class Response:
            def raise_for_status(self):
                pass

            def json(self):
                return {'response': {'header': {'resultCode': '00'}, 'body': {
                    'totalCount': 2, 'items': {'item': [{'category': 'WSD', 'fcstValue': str(len(calls))}]}}}}

        def get(url, params, timeout):
            self.assertEqual(timeout, 30)
            calls.append((url, copy.deepcopy(params)))
            return Response()

        requests = types.SimpleNamespace(get=get, RequestException=Exception)
        output = io.StringIO()
        with patch.dict(sys.modules, {'requests': requests}), patch.dict(os.environ, {'KMA_API_KEY': 'unit-test-dummy'}), patch('datetime.datetime', FixedDateTime), contextlib.redirect_stdout(output):
            exec(compile(code, f'<generated-{key}>', 'exec'), {})
        self.assertEqual([c[1]['pageNo'] for c in calls], [1, 2])
        self.assertEqual(len(json.loads(output.getvalue())), 2)
        self.assertNotIn('unit-test-dummy', output.getvalue())
        return calls

    def test_short_forecast_midnight_and_pagination(self):
        calls = self.execute_template('GRID_FORECAST')
        self.assertTrue(calls[0][0].endswith('/getVilageFcst'))
        self.assertEqual(calls[0][1]['base_date'], '20261021')
        self.assertEqual(calls[0][1]['base_time'], '0500')

    def test_ultra_forecast_midnight_and_pagination(self):
        calls = self.execute_template('GRID_ULTRA_FORECAST')
        self.assertTrue(calls[0][0].endswith('/getUltraSrtFcst'))
        self.assertEqual(calls[0][1]['base_date'], '20261021')
        self.assertEqual(calls[0][1]['base_time'], '2230')


if __name__ == '__main__':
    unittest.main()
