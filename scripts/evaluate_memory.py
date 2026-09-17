"""30 independent synthetic fixtures; deterministic checks, not a model-quality benchmark."""
import json
import sys
import tempfile
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.memory import chunks,Memory,tokens

cases=[]
for domain in ['传感器标定','轨迹规划','机器人抓取','数据质量','deployment','reliability']:
    for scenario in ['long','duplicate','conflict','update','retrieval']:
        cases.append(dict(id=len(cases)+1,domain=domain,scenario=scenario,source=f'# {domain}\n\n已记录：{domain}测试完成。\n\n待验证：在新环境下复测。',query=domain))
results=[]
for case in cases:
    started=time.monotonic();text=case['source']*(500 if case['scenario']=='long' else 1)
    split=chunks(text);coverage=''.join(x['text'] for x in split)==text
    quote=f'{case["domain"]}测试完成'
    good=json.dumps(dict(title=case['domain'],body=f'已记录：{quote}。[S1]\n适用边界：仍需复测',citations=[dict(ref='S1',quote=quote)],classification='new'),ensure_ascii=False)
    valid=bool(Memory.validate(good,[dict(ref='S1',text=text)]))
    rejected=False
    try:Memory.validate(good.replace(quote,'虚构的结果12345'),[dict(ref='S1',text=text)])
    except ValueError:rejected=True
    results.append(dict(**case,coverage=coverage,valid_quote=valid,fabricated_quote_rejected=rejected,query_tokens=tokens(case['query']),elapsed_ms=round((time.monotonic()-started)*1000,2),model_input_tokens=None,model_output_tokens=None,human_edit_rate=None,baseline_quality=None))
assert len(results)==30 and all(r['coverage'] and r['valid_quote'] and r['fabricated_quote_rejected'] for r in results)
report=dict(mode='synthetic deterministic validation; live model comparison not executed',cases=results)
if len(sys.argv)>1:Path(sys.argv[1]).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS 30 synthetic evidence/chunk fixtures. No live quality-improvement claims.')
