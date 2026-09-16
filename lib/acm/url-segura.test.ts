import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  crearTransporteNode,
  esIpInterna,
  obtenerPaginaSegura,
  UrlNoPermitida,
  validarFormaUrl,
  validarUrlPublica,
  type Resolver,
  type Transporte,
} from "./url-segura";

// EL ATAQUE (16-sep-2026): un usuario logueado pega en el ACM un link que hace que NUESTRO
// servidor abra una dirección interna y le devuelva lo que encuentra. Cada prueba de este archivo
// mete una variante del ataque y exige que falle. Si alguna pasa, el arreglo no está hecho.

const publico: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const resolverDe = (mapa: Record<string, string[]>): Resolver => async (host) => {
  const ips = mapa[host];
  if (!ips) throw Object.assign(new Error("no existe"), { code: "ENOTFOUND" });
  return ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
};

describe("esIpInterna", () => {
  it.each([
    "127.0.0.1", "127.255.255.254", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.10",
    "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::a9fe:a9fe", "2002:c0a8:0101::1",
    "no-es-ip",
  ])("%s es interna", (ip) => {
    expect(esIpInterna(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "192.169.0.1", "2606:4700::6810:85e5", "::ffff:8.8.8.8"])(
    "%s es pública",
    (ip) => {
      expect(esIpInterna(ip)).toBe(false);
    },
  );
});

describe("validarFormaUrl · el link en sí", () => {
  it.each([
    ["metadatos de la nube", "http://169.254.169.254/latest/meta-data/"],
    ["el propio servidor con puerto", "http://127.0.0.1:3000/algo"],
    ["loopback en decimal", "http://2130706433/"],
    ["loopback en hexa", "http://0x7f.1/"],
    ["IPv6 loopback", "http://[::1]:3000/"],
    ["IPv6 con IPv4 interna adentro", "http://[::ffff:127.0.0.1]/"],
    ["red privada", "https://10.0.0.5/admin"],
    ["localhost", "http://localhost:3000/api"],
    ["nombre sin punto (servicio interno)", "http://n8n:5678/"],
    ["nombre sin punto con punto final", "http://acm-extractor./extract"],
    ["terminación interna", "http://panel.internal/"],
    ["usuario y clave", "https://admin:clave@www.zonaprop.com.ar/x.html"],
    ["otro esquema", "file:///etc/passwd"],
    ["ftp", "ftp://ftp.example.com/"],
    ["basura", "no es un link"],
  ])("rechaza %s", (_nombre, url) => {
    expect(validarFormaUrl(url).ok).toBe(false);
  });

  it.each([
    "https://www.argenprop.com/departamento-en-venta-en-palermo-chico-4-ambientes--20432877",
    "https://departamento.mercadolibre.com.ar/MLA-3558606264-venta-_JM#polycard",
    "http://www.zonaprop.com.ar/propiedades/clasificado/x-58056724.html",
    "https://www.properati.com.ar/detalle/14032-32-a1b2",
    "https://93.184.216.34/aviso",
  ])("acepta un portal cualquiera: %s", (url) => {
    expect(validarFormaUrl(url).ok).toBe(true);
  });
});

describe("validarUrlPublica · adónde resuelve el nombre", () => {
  it("rechaza un nombre público que resuelve a una IP privada", async () => {
    const r = await validarUrlPublica("https://aviso-trampa.com/x", resolverDe({ "aviso-trampa.com": ["10.0.0.5"] }));
    expect(r.ok).toBe(false);
  });

  it("rechaza si UNA de las direcciones es interna, aunque las otras sean públicas", async () => {
    const r = await validarUrlPublica("https://mixto.com/", resolverDe({ "mixto.com": ["93.184.216.34", "127.0.0.1"] }));
    expect(r.ok).toBe(false);
  });

  it("rechaza IPv6 interna resuelta", async () => {
    const r = await validarUrlPublica("https://v6.com/", resolverDe({ "v6.com": ["fd00::1"] }));
    expect(r.ok).toBe(false);
  });

  it("rechaza un nombre que no existe", async () => {
    expect((await validarUrlPublica("https://no-existe.com/", resolverDe({}))).ok).toBe(false);
  });

  it("acepta un portal que resuelve a direcciones públicas", async () => {
    expect((await validarUrlPublica("https://www.argenprop.com/x--1", publico)).ok).toBe(true);
  });
});

describe("obtenerPaginaSegura · redirecciones", () => {
  /** Transporte falso que registra cada salto que se llegó a pedir. */
  function transporteFalso(respuestas: Record<string, { status: number; location?: string; html?: string }>) {
    const pedidos: string[] = [];
    const t: Transporte = async (url) => {
      pedidos.push(url.href);
      const r = respuestas[url.href];
      if (!r) throw new Error(`pedido inesperado a ${url.href}`);
      return {
        status: r.status,
        headers: (r.location ? { location: r.location } : { "content-type": "text/html; charset=utf-8" }) as Record<string, string>,
        body: Buffer.from(r.html ?? ""),
      };
    };
    return { t, pedidos };
  }

  it("un link de portal legítimo que redirige a los metadatos de la nube: falla sin pedir el destino", async () => {
    const portal = "https://www.argenprop.com/aviso--1";
    const { t, pedidos } = transporteFalso({ [portal]: { status: 302, location: "http://169.254.169.254/latest/meta-data/" } });
    await expect(obtenerPaginaSegura(portal, { transporte: t, resolver: publico })).rejects.toBeInstanceOf(UrlNoPermitida);
    expect(pedidos).toEqual([portal]);
  });

  it("redirige a un nombre que resuelve a una IP privada: falla sin pedir el destino", async () => {
    const portal = "https://www.zonaprop.com.ar/x-1.html";
    const resolver = resolverDe({ "www.zonaprop.com.ar": ["93.184.216.34"], "interno.trampa.com": ["192.168.1.10"] });
    const { t, pedidos } = transporteFalso({ [portal]: { status: 301, location: "https://interno.trampa.com/panel" } });
    await expect(obtenerPaginaSegura(portal, { transporte: t, resolver })).rejects.toBeInstanceOf(UrlNoPermitida);
    expect(pedidos).toEqual([portal]);
  });

  it("una cadena de redirecciones que termina adentro también falla", async () => {
    const a = "https://a.com/1";
    const { t, pedidos } = transporteFalso({
      [a]: { status: 302, location: "https://b.com/2" },
      "https://b.com/2": { status: 307, location: "http://localhost:3000/api/secreto" },
    });
    await expect(obtenerPaginaSegura(a, { transporte: t, resolver: publico })).rejects.toBeInstanceOf(UrlNoPermitida);
    expect(pedidos).toEqual([a, "https://b.com/2"]);
  });

  it("sigue una redirección relativa y pública, y devuelve la página", async () => {
    const a = "https://www.argenprop.com/viejo";
    const { t } = transporteFalso({
      [a]: { status: 301, location: "/nuevo--20432877" },
      "https://www.argenprop.com/nuevo--20432877": { status: 200, html: "<html>ok</html>" },
    });
    const r = await obtenerPaginaSegura(a, { transporte: t, resolver: publico });
    expect(r).toEqual({ status: 200, html: "<html>ok</html>", urlFinal: "https://www.argenprop.com/nuevo--20432877" });
  });

  it("corta después de demasiadas redirecciones", async () => {
    const t: Transporte = async (url) => ({ status: 302, headers: { location: url.href + "x" }, body: Buffer.alloc(0) });
    await expect(obtenerPaginaSegura("https://a.com/", { transporte: t, resolver: publico, maxRedirecciones: 3 })).rejects.toThrow(
      "demasiadas redirecciones",
    );
  });

  it("el link inicial interno no llega a pedirse", async () => {
    const { t, pedidos } = transporteFalso({});
    await expect(obtenerPaginaSegura("http://127.0.0.1:3000/algo", { transporte: t, resolver: publico })).rejects.toBeInstanceOf(
      UrlNoPermitida,
    );
    expect(pedidos).toEqual([]);
  });
});

// Con sockets de verdad: un servidor escuchando en 127.0.0.1 hace de "servicio interno" y cuenta
// cuántos pedidos le llegan. El ataque falla si le llegan CERO.
describe("transporte real · control en el momento de conectar", () => {
  let servidor: http.Server;
  let puerto = 0;
  let recibidos = 0;

  beforeAll(async () => {
    servidor = http.createServer((_req, res) => {
      recibidos++;
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("secreto interno");
    });
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
    puerto = (servidor.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => servidor.close(() => r())));

  it("control: el servicio interno responde si se lo pide directo (si no, las otras pruebas no prueban nada)", async () => {
    recibidos = 0;
    const t = crearTransporteNode(publico);
    const r = await t(new URL(`http://127.0.0.1:${puerto}/`), {}, 3000);
    expect(r.body.toString()).toBe("secreto interno");
    expect(recibidos).toBe(1);
  });

  it("un nombre que al conectar resuelve a 127.0.0.1 no llega al servicio interno", async () => {
    recibidos = 0;
    const t = crearTransporteNode(resolverDe({ "trampa.com": ["127.0.0.1"] }));
    await expect(t(new URL(`http://trampa.com:${puerto}/`), {}, 3000)).rejects.toBeInstanceOf(UrlNoPermitida);
    expect(recibidos).toBe(0);
  });

  it("DNS que cambia entre el control y la conexión (público primero, interno después): no llega", async () => {
    recibidos = 0;
    let llamadas = 0;
    const cambiante: Resolver = async () => [{ address: llamadas++ === 0 ? "93.184.216.34" : "127.0.0.1", family: 4 }];
    await expect(obtenerPaginaSegura(`http://rebind.trampa.com:${puerto}/`, { resolver: cambiante, timeoutMs: 3000 })).rejects.toBeInstanceOf(
      UrlNoPermitida,
    );
    expect(llamadas).toBe(2); // se controló al validar Y al conectar
    expect(recibidos).toBe(0);
  });
});
