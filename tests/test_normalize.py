import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('normalize', Path(__file__).resolve().parents[1]/'scripts'/'normalize_stations.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
HEADER = '지점,시작일,종료일,지점명,지점주소,위도,경도\n'


class NormalizeTests(unittest.TestCase):
    def parse(self, body):
        return module.normalize((HEADER+body).encode('cp949'), 'ASOS', '2026-10-22')

    def test_history_and_leading_zero(self):
        points,total,excluded = self.parse('001,2000-01-01,2010-01-01,옛지점,서울특별시,37,127\n001,2010-01-01,,새지점,서울특별시 종로구,37.5,127\n002,2027-01-01,,미래지점,서울특별시,37,127\n')
        self.assertEqual((len(points),total,excluded),(1,3,2))
        self.assertEqual(points[0]['id'],'001')
        self.assertEqual(points[0]['name'],'새지점')
        self.assertEqual(points[0]['region'],'서울특별시')

    def test_invalid_coordinates(self):
        with self.assertRaises(ValueError):
            self.parse('108,2000-01-01,,서울,서울,NaN,127\n')

    def test_conflicting_history(self):
        with self.assertRaises(ValueError):
            self.parse('108,2000-01-01,,서울,서울,37,127\n108,2000-01-01,,서울,서울,38,127\n')

    def test_html_response(self):
        with self.assertRaises(ValueError):
            module.normalize(b'<html>Login</html>', 'ASOS', '2026-10-22')


if __name__ == '__main__':
    unittest.main()
