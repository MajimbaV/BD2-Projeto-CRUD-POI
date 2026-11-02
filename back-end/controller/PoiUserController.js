import PoiUser from "../model/PoiUser.js";

const categorias = ['Residêncial', 'Trabalho', 'Saúde', 'Lazer', 'Outro'];

function validatePoiUserInput(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: "O corpo da requisição deve ser um objeto." };
    }

    const { nome, descricao, categoria, endereco, latitude, longitude } = body;

    if (typeof nome !== "string" || nome.trim().length === 0 || nome.trim().length > 150) {
        return { error: "O nome é obrigatório e deve ter até 150 caracteres." };
    }

    if (descricao !== undefined && descricao !== null && typeof descricao !== "string") {
        return { error: "A descrição deve ser um texto." };
    }

    if (endereco !== undefined && endereco !== null && typeof endereco !== "string") {
        return { error: "O endereço deve ser um texto." };
    }

    if (categoria !== undefined && categoria !== null && !categorias.includes(categoria)) {
        return { error: "Categoria inválida." };
    }

    const latitudeValida = typeof latitude === "number" || (typeof latitude === "string" && latitude.trim() !== "");
    const longitudeValida = typeof longitude === "number" || (typeof longitude === "string" && longitude.trim() !== "");
    const latitudeNumerica = Number(latitude);
    const longitudeNumerica = Number(longitude);

    if (!latitudeValida || !Number.isFinite(latitudeNumerica) || latitudeNumerica < -90 || latitudeNumerica > 90) {
        return { error: "A latitude deve ser um número entre -90 e 90." };
    }

    if (!longitudeValida || !Number.isFinite(longitudeNumerica) || longitudeNumerica < -180 || longitudeNumerica > 180) {
        return { error: "A longitude deve ser um número entre -180 e 180." };
    }

    return {
        data: {
            nome: nome.trim(),
            descricao,
            categoria,
            endereco,
            localizacao: {
                type: "Point",
                coordinates: [longitudeNumerica, latitudeNumerica]
            }
        }
    };
}

export async function getAllPoiUser(req, res) {
    try {
        const pois = await PoiUser.findAll();
        res.json(pois);
    }catch (error) {
        console.error("Erro ao listar pontos de interesse:", error);
        res.status(500).json({ message: "Erro ao listar pontos de interesse." });
    }
}

export async function getPoiUserById(req, res) {
    const { id } = req.params;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(id)) {
        return res.status(400).json({ message: "ID inválido." });
    }

    try {
        const poi = await PoiUser.findByPk(id);
        if (!poi) {
            return res.status(404).json({ message: "Local não encontrado." });
        }

        res.json(poi);
    } catch (error) {
        console.error("Erro ao consultar ponto de interesse:", error);
        res.status(500).json({ message: "Erro ao consultar ponto de interesse." });
    }
}

export async function createPoiUser(req, res) {
    const { data, error } = validatePoiUserInput(req.body);
    if (error) {
        return res.status(400).json({ message: error });
    }

    try {
        const novoLocal = await PoiUser.create(data);

        res.status(201).json(novoLocal);
    }catch (error) {
        console.error("Erro ao cadastrar ponto de interesse:", error);
        res.status(500).json({ message: "Erro ao cadastrar ponto de interesse." });
    }
}

export async function updatePoiUser(req, res) {
    const { data, error } = validatePoiUserInput(req.body);
    if (error) {
        return res.status(400).json({ message: error });
    }

    try {
        const { id } = req.params;

        const local = await PoiUser.findByPk(id);
        if (!local) {
            return res.status(404).json({ message: "Local não encontrado" });
        }

        await local.update(data);

        res.status(200).json(local);
    } catch (error) {
        console.error("Erro ao atualizar ponto de interesse:", error);
        res.status(500).json({ message: "Erro ao atualizar ponto de interesse." });
    }
}

export async function deletePoiUser(req, res) {
    try {
        const { id } = req.params;
        const local = await PoiUser.findByPk(id);
        if (!local) {
            return res.status(404).json({ message: "Local não encontrado" });
        }
        await local.destroy();
        res.status(204).end();
    } catch (error) {
        console.error("Erro ao excluir ponto de interesse:", error);
        res.status(500).json({ message: "Erro ao excluir ponto de interesse." });
    }
}