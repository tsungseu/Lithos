import unittest
from pathlib import Path
from unittest.mock import patch
from backend import server

class FocusTests(unittest.TestCase):
    def test_only_metadata_sent_and_no_draft_written(self):
        with patch.object(server, 'project', return_value=Path('测试项目')), patch.object(server, 'documents', return_value={'files':[{'id':'测试.md'}]}), patch.object(server, 'call_model', return_value=('建议文本','mock','','default')) as model:
            result=server.suggest_focus({'project':'x','files':['测试.md'],'focus':'用户目标','key':'synthetic'})
            self.assertEqual(result, {'suggestion':'建议文本','model':'mock'})
            messages=model.call_args.args[1]
            self.assertIn('测试.md', messages[1]['content'])
            self.assertIn('用户目标', messages[1]['content'])
            self.assertNotIn('synthetic', str(messages))
    def test_invalid_selection_does_not_call_model(self):
        with patch.object(server,'project',return_value=Path('测试项目')), patch.object(server,'documents',return_value={'files':[]}), patch.object(server,'call_model') as model:
            for files in [['../secret'], 'file', [1], ['a']*13]:
                with self.assertRaises(ValueError):server.suggest_focus({'project':'x','files':files})
            model.assert_not_called()

if __name__=='__main__':unittest.main()
