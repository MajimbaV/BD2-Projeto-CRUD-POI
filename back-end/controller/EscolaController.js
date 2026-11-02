import sequelize from "../database/sequelize.js";
import { QueryTypes } from "sequelize";

/**
 * Busca escolas num raio de distância a partir de um ponto (ex: localização do usuário ou POI),
 * ordenadas pelo Score Ponderado de Infraestrutura (DESC) e depois pela Distância (ASC).
 */
export async function getEscolasProximas(req, res) {
    try {
        const { latitude, longitude, raio = 2000, limite = 50 } = req.query;

        const lat = Number(latitude);
        const lon = Number(longitude);
        const raioMetros = Number(raio);
        const limit = Math.min(Math.max(Number(limite) || 50, 1), 200);

        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
            return res.status(400).json({ message: "Latitude inválida. Deve estar entre -90 e 90." });
        }

        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
            return res.status(400).json({ message: "Longitude inválida. Deve estar entre -180 e 180." });
        }

        if (!Number.isFinite(raioMetros) || raioMetros <= 0) {
            return res.status(400).json({ message: "Raio inválido. Deve ser um número maior que zero (em metros)." });
        }

        const query = `
            SELECT 
                objectid,
                co_escola,
                no_escola,
                municipio,
                bairro,
                rua,
                numero,
                score_infraestrutura,
                in_biblioteca,
                in_laboratorio_informatica,
                in_laboratorio_ciencias,
                in_sala_leitura,
                in_banda_larga,
                in_internet,
                in_computador,
                in_banheiro_pne,
                in_quadra_esportes,
                in_parque_infantil,
                ROUND(ST_Distance(
                    geom::geography, 
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
                )::numeric, 1) AS distancia_metros,
                ST_X(geom) AS longitude,
                ST_Y(geom) AS latitude
            FROM public.vw_escolas_ranking
            WHERE ST_DWithin(
                geom::geography, 
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, 
                :raioMetros
            )
            ORDER BY score_infraestrutura DESC, distancia_metros ASC
            LIMIT :limit;
        `;

        const escolas = await sequelize.query(query, {
            replacements: { lon, lat, raioMetros, limit },
            type: QueryTypes.SELECT
        });

        res.json(escolas);
    } catch (error) {
        console.error("Erro ao buscar escolas próximas:", error);
        res.status(500).json({ message: "Erro ao buscar escolas próximas.", detalhe: error.message });
    }
}

/**
 * Busca escolas contidas na área visível do mapa (Bounding Box / BBOX) do Leaflet.
 * Requisito: Não carregar todos os pontos de uma vez; carregar conforme movimentação do mapa.
 */
export async function getEscolasBbox(req, res) {
    try {
        const { minLon, minLat, maxLon, maxLat, limite = 100 } = req.query;

        const xMin = Number(minLon);
        const yMin = Number(minLat);
        const xMax = Number(maxLon);
        const yMax = Number(maxLat);
        const limit = Math.min(Math.max(Number(limite) || 100, 1), 300);

        if ([xMin, yMin, xMax, yMax].some((coord) => !Number.isFinite(coord))) {
            return res.status(400).json({ 
                message: "Coordenadas da BBOX inválidas. Informe minLon, minLat, maxLon e maxLat numéricos." 
            });
        }

        const query = `
            SELECT 
                objectid,
                co_escola,
                no_escola,
                municipio,
                bairro,
                rua,
                numero,
                score_infraestrutura,
                in_biblioteca,
                in_laboratorio_informatica,
                in_laboratorio_ciencias,
                in_sala_leitura,
                in_banda_larga,
                in_internet,
                in_computador,
                in_banheiro_pne,
                in_quadra_esportes,
                in_parque_infantil,
                ST_X(geom) AS longitude,
                ST_Y(geom) AS latitude
            FROM public.vw_escolas_ranking
            WHERE geom && ST_MakeEnvelope(:xMin, :yMin, :xMax, :yMax, 4326)
            ORDER BY score_infraestrutura DESC
            LIMIT :limit;
        `;

        const escolas = await sequelize.query(query, {
            replacements: { xMin, yMin, xMax, yMax, limit },
            type: QueryTypes.SELECT
        });

        res.json(escolas);
    } catch (error) {
        console.error("Erro ao buscar escolas por BBOX:", error);
        res.status(500).json({ message: "Erro ao buscar escolas pela área do mapa.", detalhe: error.message });
    }
}

/**
 * Consulta os detalhes de uma escola específica por co_escola ou objectid.
 */
export async function getEscolaById(req, res) {
    try {
        const { id } = req.params;
        const codigo = Number(id);

        if (!Number.isInteger(codigo) || codigo <= 0) {
            return res.status(400).json({ message: "Código de escola inválido." });
        }

        const query = `
            SELECT 
                objectid,
                co_escola,
                no_escola,
                municipio,
                bairro,
                rua,
                numero,
                score_infraestrutura,
                in_biblioteca,
                in_laboratorio_informatica,
                in_laboratorio_ciencias,
                in_sala_leitura,
                in_banda_larga,
                in_internet,
                in_computador,
                in_banheiro_pne,
                in_quadra_esportes,
                in_parque_infantil,
                ST_X(geom) AS longitude,
                ST_Y(geom) AS latitude
            FROM public.vw_escolas_ranking
            WHERE co_escola = :codigo OR objectid = :codigo
            LIMIT 1;
        `;

        const resultado = await sequelize.query(query, {
            replacements: { codigo },
            type: QueryTypes.SELECT
        });

        if (resultado.length === 0) {
            return res.status(404).json({ message: "Escola não encontrada." });
        }

        res.json(resultado[0]);
    } catch (error) {
        console.error("Erro ao buscar escola:", error);
        res.status(500).json({ message: "Erro ao consultar escola.", detalhe: error.message });
    }
}
