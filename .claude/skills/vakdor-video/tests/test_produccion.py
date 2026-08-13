"""Tests de las piezas de producción: export, encuadre, privacidad, mezcla y prep.

Todo lo que se testea acá es función pura: no toca ffmpeg ni el disco.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "helpers"))

import export
import frame_map as fm
import mix_audio as ma
import prep
import privacy as pv
from edl import map_masks_to_output, validate_audio, validate_edl
from subtitles import build_ass


# ── export ───────────────────────────────────────────────────────────────────

def test_bitrate_igual_en_vertical_y_horizontal():
    """Mismo recuento de píxeles, mismo bitrate: el formato no cambia el cap."""
    assert export.social_bitrate_mbps(1080, 1920) == 6.0
    assert export.social_bitrate_mbps(1920, 1080) == 6.0


def test_bitrate_cuadrado_baja_pero_respeta_el_piso():
    assert export.social_bitrate_mbps(1080, 1080) == export.MIN_BITRATE_MBPS
    assert export.social_bitrate_mbps(320, 240) == export.MIN_BITRATE_MBPS


def test_social_capea_y_nunca_supera_la_referencia():
    """Un 4K no debe salir con más bitrate que la referencia: el cap es un techo."""
    assert export.social_bitrate_mbps(2160, 3840) == export.REF_BITRATE_MBPS


def test_todo_perfil_etiqueta_color_completo():
    """Los 4 tags + los x264-params: sin estos últimos, primaries y transfer
    quedan en 'unknown' en el archivo (verificado en ffmpeg 8.1.1)."""
    for profile in export.PROFILES:
        args = export.video_args(profile, 1080, 1920, 30)
        assert "-colorspace" in args and "-color_range" in args
        assert "-x264-params" in args
        params = args[args.index("-x264-params") + 1]
        assert "colorprim=bt709" in params and "transfer=bt709" in params


def test_social_lleva_cap_y_faststart_y_lo_intermedio_no():
    social = export.encode_args("social", 1080, 1920, 30)
    assert "-b:v" in social and "-maxrate" in social and "+faststart" in social
    assert "-b:a" in social and social[social.index("-b:a") + 1] == "256k"
    inter = export.encode_args("intermediate", 1080, 1920)
    assert "-b:v" not in inter, "un paso intermedio no debe capear bitrate"
    assert "+faststart" not in inter


def test_perfil_desconocido_falla():
    with pytest.raises(ValueError):
        export.video_args("h265")


# ── encuadre y danger zones ──────────────────────────────────────────────────

@pytest.mark.parametrize("w,h,esperado", [
    (1080, 1920, "vertical"), (1920, 1080, "horizontal"), (1080, 1080, "cuadrado"),
    (720, 1280, "vertical"), (3840, 2160, "horizontal"),
])
def test_clasificacion_de_formato(w, h, esperado):
    assert fm.format_of(w, h) == esperado


def test_danger_zone_escala_con_la_resolucion():
    """Un vertical de 720x1280 tiene las mismas zonas en proporción."""
    full = fm.danger_zone(1080, 1920)
    half = fm.danger_zone(720, 1280)
    assert half["bottom"] == pytest.approx(full["bottom"] * 1280 / 1920, abs=1)
    assert half["left"] == pytest.approx(full["left"] * 720 / 1080, abs=1)


def test_margen_de_subtitulo_no_cambia_en_horizontal():
    """Regresión: el horizontal ya se veía bien con el 19.5% y no se toca."""
    assert fm.caption_margin_v(1920, 1080, 40) == int(1080 * 0.195)


def test_margen_de_subtitulo_sube_en_vertical():
    """El 19.5% dejaba el subtítulo debajo de la botonera de TikTok."""
    margen = fm.caption_margin_v(1080, 1920, 40)
    assert margen > int(1920 * 0.195)
    assert margen >= fm.danger_zone(1080, 1920)["bottom"]


def test_el_subtitulo_queda_arriba_de_la_danger_zone():
    w, h, fs = 1080, 1920, 40
    borde_de_texto = h - fm.caption_margin_v(w, h, fs)
    assert borde_de_texto <= fm.safe_box(w, h)["y1"]


def test_caja_segura_dentro_del_cuadro():
    sb = fm.safe_box(1080, 1920)
    assert 0 < sb["x0"] < sb["x1"] <= 1080
    assert 0 < sb["y0"] < sb["y1"] <= 1920


def test_parseo_de_cortes_de_plano():
    log = "frame:1 pts:100 pts_time:3.33\nframe:2 pts:200 pts_time:12.5\nruido\n"
    assert fm.parse_scene_times(log) == [3.33, 12.5]


def test_parseo_de_cortes_sin_resultados():
    assert fm.parse_scene_times("nada que ver acá") == []


def test_la_regla_dibuja_las_danger_zones_y_la_rejilla():
    f = fm.ruler_filter(1080, 1920, 100)
    assert f.count("color=red@0.20") == 4, "las 4 bandas de danger zone"
    assert "drawbox" in f and "cyan" in f


# ── privacidad ───────────────────────────────────────────────────────────────

def test_la_caja_se_pasa_del_texto_por_el_degradado():
    x, y, w, h = pv.expand_rect((200, 300, 400, 100), 1080, 1920, feather=26)
    assert x == 174 and y == 274
    assert w >= 400 + 52 and h >= 100 + 52


def test_la_caja_no_se_sale_del_cuadro():
    x, y, w, h = pv.expand_rect((0, 1880, 1080, 40), 1080, 1920, feather=26)
    assert x >= 0 and y >= 0
    assert x + w <= 1080 and y + h <= 1920


def test_las_cajas_salen_con_lados_pares():
    """yuv420p necesita dimensiones pares o el crop falla."""
    _, _, w, h = pv.expand_rect((11, 13, 101, 103), 1080, 1920, feather=0)
    assert w % 2 == 0 and h % 2 == 0


def test_anclar_y_crecer_usa_la_union():
    """Nunca se interpola la posición: se toma la caja que cubre las dos."""
    m = {"from": 1, "to": 2,
         "rects": [[250, 300, 600, 470]], "rects_end": [[250, 300, 830, 600]]}
    (x, y, w, h), = pv.resolve_mask(m, 1080, 1920, feather=0)
    assert (x, y) == (250, 300)
    assert w == 830 and h == 600


def test_la_union_cubre_las_dos_cajas():
    assert pv.union_rect((0, 0, 10, 10), (5, 5, 10, 10)) == (0, 0, 15, 15)
    assert pv.union_rect((5, 5, 10, 10), (0, 0, 10, 10)) == (0, 0, 15, 15)


def test_full_frame_pasa_derecho():
    assert pv.resolve_mask({"from": 1, "to": 2, "rects": "full"}, 1080, 1920) == "full"


@pytest.mark.parametrize("mask,fragmento", [
    ({"to": 2, "rects": "full"}, "faltan"),
    ({"from": 3, "to": 2, "rects": "full"}, "debe ser <"),
    ({"from": 1, "to": 2}, "sin 'rects'"),
    ({"from": 1, "to": 2, "rects": [[0, 0, 0, 10]]}, "deben ser > 0"),
    ({"from": 1, "to": 2, "rects": [[0, 0, 10, 10]], "rects_end": [[0, 0, 1, 1], [0, 0, 1, 1]]},
     "coincidir"),
])
def test_errores_de_mascaras(mask, fragmento):
    errs = pv.validate_masks([mask], 1080, 1920)
    assert errs, f"se esperaba un error para {mask}"
    assert any(fragmento in e for e in errs), errs


def test_mascara_valida_no_da_errores():
    assert pv.validate_masks(
        [{"from": 1.2, "to": 3.0, "rects": [[100, 400, 500, 300]]}], 1080, 1920) == []


def test_filtergraph_encadena_todas_las_regiones():
    masks = [{"from": 1, "to": 2, "rects": [[100, 100, 200, 200]]},
             {"from": 3, "to": 4, "rects": "full"}]
    fg = pv.build_filtergraph(masks, 1080, 1920, soft=False)
    assert fg.startswith("[0:v]split=3[base][r0][r1]"), fg[:60]
    assert fg.count("gblur") == 2
    assert fg.count("overlay") == 2
    assert fg.endswith("[vmask]")


def test_filtergraph_suave_agrega_el_anillo_exterior():
    masks = [{"from": 1, "to": 2, "rects": [[100, 100, 200, 200]]}]
    duro = pv.build_filtergraph(masks, 1080, 1920, soft=False)
    suave = pv.build_filtergraph(masks, 1080, 1920, soft=True)
    assert suave.count("gblur") == duro.count("gblur") + 1


def test_sin_mascaras_no_hay_filtro():
    assert pv.build_filtergraph([], 1080, 1920) == ""


def test_el_blur_entra_antes_y_sale_despues_de_la_ventana():
    fg = pv.build_filtergraph(
        [{"from": 5.0, "to": 6.0, "rects": "full"}], 1080, 1920)
    assert "between(t,4.800,6.200)" in fg


# ── mezcla de audio ──────────────────────────────────────────────────────────

def test_la_cama_queda_los_lu_pedidos_bajo_la_voz():
    """La cama termina en (voz - duck), venga de donde venga su mastering."""
    for bed_lufs in (-8.0, -14.0, -22.0):
        g = ma.bed_gain_db(voice_lufs=-16.0, bed_lufs=bed_lufs, duck_lu=12.0)
        assert bed_lufs + g == pytest.approx(-28.0)


def test_mas_duck_es_menos_musica():
    fuerte = ma.bed_gain_db(-16.0, -14.0, 8.0)
    discreta = ma.bed_gain_db(-16.0, -14.0, 16.0)
    assert discreta < fuerte


def test_el_efecto_queda_el_relativo_pedido_bajo_el_pico_de_la_voz():
    g = ma.sfx_gain_db(voice_peak=-3.0, rel_db=-9.0, sfx_peak=-1.0)
    assert -1.0 + g == pytest.approx(-12.0)


def test_conversion_db_a_ganancia():
    assert ma.db_to_gain(0) == 1.0
    assert ma.db_to_gain(-6) == pytest.approx(0.5, abs=0.005)
    assert ma.db_to_gain(-20) == pytest.approx(0.1, abs=0.001)


def test_la_mezcla_normaliza_al_final_no_antes():
    fg = ma.build_filtergraph(60.0, "0:a", [{"label": "1:a", "gain": 0.3}], [])
    assert fg.index("amix") < fg.index("loudnorm"), \
        "loudnorm va DESPUÉS del amix: normalizar antes esconde que la música tapa la voz"


def test_la_cama_pasa_por_sidechain_con_la_voz_de_llave():
    fg = ma.build_filtergraph(60.0, "0:a", [{"label": "1:a", "gain": 0.3}], [])
    assert "[bgmraw][vkey]sidechaincompress" in fg


def test_se_puede_apagar_el_sidechain():
    fg = ma.build_filtergraph(60.0, "0:a", [{"label": "1:a", "gain": 0.3}], [],
                              sidechain=False)
    assert "sidechaincompress" not in fg


def test_dos_camas_hacen_crossfade_en_el_swap():
    fg = ma.build_filtergraph(60.0, "0:a",
                              [{"label": "1:a", "gain": 0.3}, {"label": "2:a", "gain": 0.4}],
                              [], swap=30.0, xfade=2.0)
    assert "adelay=30000|30000" in fg
    assert "[bgA][bgB]amix" in fg


def test_los_efectos_entran_en_su_segundo():
    fg = ma.build_filtergraph(60.0, "0:a", [],
                              [{"label": "1:a", "at": 18.6, "gain": 0.5}])
    assert "adelay=18600|18600" in fg


def test_amix_no_normaliza_solo():
    """normalize=1 tiraría abajo los volúmenes que acabamos de medir."""
    fg = ma.build_filtergraph(60.0, "0:a", [{"label": "1:a", "gain": 0.3}], [])
    assert "normalize=0" in fg
    assert "normalize=1" not in fg


def test_sin_cama_ni_efectos_igual_hay_salida():
    fg = ma.build_filtergraph(10.0, "0:a", [], [])
    assert fg.endswith("[aout]")


# ── prep ─────────────────────────────────────────────────────────────────────

def test_palabras_por_minuto():
    assert prep.words_per_minute(300, 60) == 300.0
    assert prep.words_per_minute(0, 0) == 0.0


def test_material_sin_huecos_es_overlay_only():
    assert prep.cut_recommendation(0)["verdict"] == "overlay-only"
    assert prep.cut_recommendation(2)["verdict"] == "overlay-only"


def test_material_con_silencios_se_corta():
    assert prep.cut_recommendation(20)["verdict"] == "cortar"


def test_ritmo_rapido_delata_material_ya_editado():
    assert prep.cut_recommendation(4, wpm=260)["verdict"] == "overlay-only"
    assert prep.cut_recommendation(4, wpm=150)["verdict"] == "cortar"


def test_pistas_iguales_son_duplicadas():
    assert prep.tracks_are_duplicates([-18.2, -18.2])
    assert prep.tracks_are_duplicates([-18.2, -18.5])
    assert not prep.tracks_are_duplicates([-18.2, -30.1])
    assert not prep.tracks_are_duplicates([-18.2])


# ── EDL: máscaras y audio ────────────────────────────────────────────────────

def _edl(**extra):
    base = {"sources": {"a": "a.mp4"},
            "ranges": [{"source": "a", "start": 10.0, "end": 20.0},
                       {"source": "a", "start": 50.0, "end": 60.0}]}
    base.update(extra)
    return base


def test_la_mascara_se_lleva_al_tiempo_de_salida():
    """Medís sobre el crudo; el corte la mueve sola."""
    e = _edl(masks=[{"from": 52.0, "to": 54.0, "rects": "full"}])
    (m,) = map_masks_to_output(e)
    assert (m["from"], m["to"]) == (12.0, 14.0)
    assert m["timeline"] == "output"


def test_la_mascara_que_cruza_un_corte_sale_partida():
    e = _edl(masks=[{"from": 15.0, "to": 55.0, "rects": "full"}])
    partes = map_masks_to_output(e)
    assert len(partes) == 2
    assert (partes[0]["from"], partes[0]["to"]) == (5.0, 10.0)
    assert (partes[1]["from"], partes[1]["to"]) == (10.0, 15.0)


def test_la_mascara_de_un_tramo_descartado_desaparece():
    e = _edl(masks=[{"from": 30.0, "to": 40.0, "rects": "full"}])
    assert map_masks_to_output(e) == []


def test_la_mascara_ya_medida_en_salida_pasa_igual():
    e = _edl(masks=[{"from": 1.0, "to": 2.0, "rects": "full", "timeline": "output"}])
    (m,) = map_masks_to_output(e)
    assert (m["from"], m["to"]) == (1.0, 2.0)


def test_con_varias_fuentes_hay_que_decir_cual():
    e = {"sources": {"a": "a.mp4", "b": "b.mp4"},
         "ranges": [{"source": "a", "start": 0, "end": 5}],
         "masks": [{"from": 1, "to": 2, "rects": "full"}]}
    assert any("hay que decir 'source'" in x for x in validate_edl(e))


def test_audio_valido_no_da_errores():
    assert validate_audio({"bgm": ["a.wav"], "duck_lu": 12,
                           "sfx": [{"file": "s.wav", "at": 3.0, "rel_db": -9}]}) == []


def test_dos_camas_necesitan_swap():
    assert any("swap" in e for e in validate_audio({"bgm": ["a.wav", "b.wav"]}))


def test_no_mas_de_dos_camas():
    assert any("máximo 2" in e for e in validate_audio({"bgm": ["a", "b", "c"], "swap": 1}))


def test_efecto_sin_segundo_es_error():
    assert any("'at'" in e for e in validate_audio({"sfx": [{"file": "s.wav"}]}))


def test_sin_bloque_de_audio_no_hay_errores():
    assert validate_audio(None) == []


# ── subtítulos ───────────────────────────────────────────────────────────────

def test_el_ass_usa_la_resolucion_real_y_el_margen_seguro():
    cues = [{"start": 0.0, "end": 1.0, "text": "hola"}]
    ass = build_ass(cues, width=1080, height=1920, fontsize=40, emphasis=False)
    assert "PlayResX: 1080" in ass and "PlayResY: 1920" in ass
    assert f",{fm.caption_margin_v(1080, 1920, 40)},1" in ass


def test_el_ass_corrige_la_jerga_de_la_marca():
    cues = [{"start": 0.0, "end": 1.0, "text": "usamos valdor y prisma ea"}]
    ass = build_ass(cues, emphasis=False)
    assert "Vakdor" in ass and "PRISMA" in ass
    assert "valdor" not in ass
