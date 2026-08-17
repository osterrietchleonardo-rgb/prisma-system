import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "helpers"))
from prep import is_hdr, TONEMAP_VF


def test_hlg_de_celular_es_hdr():
    # Los metadatos exactos de "Video reel 2.mov", el .mov que destapo el problema.
    assert is_hdr("arib-std-b67", "bt2020") is True


def test_hdr10_pq_es_hdr():
    assert is_hdr("smpte2084", "bt2020") is True


def test_bt2020_sin_transferencia_marcada_igual_es_hdr():
    assert is_hdr(None, "bt2020") is True


def test_sdr_no_es_hdr():
    assert is_hdr("bt709", "bt709") is False


def test_sin_metadatos_no_es_hdr():
    assert is_hdr(None, None) is False


def test_la_cadena_de_tonemap_tiene_el_orden_correcto():
    lineal = TONEMAP_VF.index("zscale=t=linear")
    mapeo = TONEMAP_VF.index("tonemap=")
    vuelta = TONEMAP_VF.index("zscale=t=bt709")
    assert lineal < mapeo < vuelta
    # desat=0: el default de ffmpeg (desat=2) desatura las altas y deja la piel gris.
    assert "desat=0" in TONEMAP_VF


def test_la_cadena_python_y_la_del_motor_js_son_la_misma():
    """Si estas dos se separan, el modo helpers y el modo studio dan colores distintos.

    No compara texto contra texto: le pide al motor JS que ARME la cadena y compara el
    resultado. Un cambio en cualquiera de los dos lados rompe esta prueba a proposito.
    """
    import json, shutil, subprocess
    if not shutil.which("node"):
        import pytest
        pytest.skip("node no esta en el PATH")
    hdr_mjs = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "engine", "lib", "hdr.mjs"))
    url = "file:///" + hdr_mjs.replace("\\", "/")
    codigo = (
        f"const m = await import({json.dumps(url)});"
        "process.stdout.write(m.filtroDeTonemap("
        '{transfer:"arib-std-b67", primaries:"bt2020"}));'
    )
    r = subprocess.run(["node", "--input-type=module", "-e", codigo],
                       capture_output=True, text=True, check=True)
    assert r.stdout.strip() == TONEMAP_VF
