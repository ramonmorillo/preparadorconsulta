# Verifica que cada «ancla» de las guías de entrevista motivacional (datos/guia/*.json) aparece
# literalmente en el texto del documento de la adaptación CMO y en la página indicada.
# Los textos de los documentos NO se incluyen en el repositorio (son de la SEFH): se extraen con
#   pdftotext -layout -f N -l N documento.pdf -  (una página cada vez, precedida de «=== PÁGINA PDF N ===»)
# y se guardan como <carpeta>/<modelo>.txt.
# Uso: python3 pruebas/verificar_guias.py <carpeta_con_textos>
import os
RAIZ=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS=os.environ.get('DOCS') or (__import__('sys').argv[1] if len(__import__('sys').argv)>1 else 'textos')
import json,glob,re,sys,unicodedata
def norm(t):
    t=unicodedata.normalize('NFC',t); t=t.replace('­','')
    t=re.sub(r'-\s*\n\s*','',t)          # palabras partidas a final de línea
    t=re.sub(r'[«»“”"‘’\']','',t); t=re.sub(r'\s+',' ',t); return t.lower()
def paginas(doc):
    s=open(DOCS+f'/{doc}.txt').read(); parts=re.split(r'=== PÁGINA PDF (\d+) ===\n',s)[1:]
    return {int(parts[i]):parts[i+1] for i in range(0,len(parts),2)}
tot=bad=0
for f in sorted(glob.glob(''+os.path.join(RAIZ,'datos/guia/*.json')+'')):
    g=json.load(open(f)); m=g['modelo']
    try: P=paginas(m)
    except FileNotFoundError: print(m,'(sin texto fuente local)'); continue
    full=norm(' '.join(P[k] for k in sorted(P)))
    items=[]
    def walk(o,ruta):
        if isinstance(o,dict):
            if 'ancla' in o: items.append((ruta,o['ancla'],str(o.get('pagina',''))))
            for k,v in o.items(): walk(v,ruta+'.'+k)
        elif isinstance(o,list):
            for i,v in enumerate(o): walk(v,f'{ruta}[{i}]')
    walk(g,m)
    for ruta,a,pag in items:
        tot+=1; na=norm(a).replace('- ','')
        if na not in full: bad+=1; print('NO ENCONTRADA',ruta,'«'+a+'»'); continue
        # comprobar página impresa (rango): la ancla debe estar en alguna de esas páginas PDF (página impresa = PDF en estos documentos? se comprueba ±2)
        nums=[int(x) for x in re.findall(r'\d+',pag)]
        off=int(g['documento'].get('desfase_pdf',0))
        rng=range(min(nums)+off-(1 if m=='migrana' else 0),max(nums)+off+1) if nums else []
        ok=any(na in norm(P.get(p,'')+' '+P.get(p+1,'')) for p in rng)
        if not ok: bad+=1; print('PÁGINA DUDOSA',ruta,pag,'«'+a+'»')
print(f'anclas comprobadas: {tot}  problemas: {bad}')
sys.exit(1 if bad else 0)
