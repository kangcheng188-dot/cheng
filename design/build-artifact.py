#!/usr/bin/env python3
"""从 design/index.html 抽出正文，生成可直接发布为 Artifact 的片段（不含 doctype/html/head/body 标签）。"""
import io,os,sys
root=os.path.dirname(os.path.abspath(__file__))
src=io.open(os.path.join(root,'index.html'),encoding='utf-8').read()
a=src.index('<!--ARTIFACT-START-->')+len('<!--ARTIFACT-START-->')
b=src.index('<!--ARTIFACT-END-->')
body='\n'.join(l for l in src[a:b].split('\n') if l.strip() not in ('</head>','<body>'))
out=sys.argv[1] if len(sys.argv)>1 else os.path.join(root,'artifact.html')
io.open(out,'w',encoding='utf-8').write(body.strip()+'\n')
print(out,len(body),'bytes')
