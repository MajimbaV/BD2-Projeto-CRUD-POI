import PoiUser from "../model/PoiUser.js";

export async function getAllPoiUser(req, res) {
    try {
        const pois = await PoiUser.findAll();
        res.json(pois);
    }catch (error) {
        res.status(400).json(error);
    }
}

export async function createPoiUser(req, res) {
    try {
        const { nome, descricao, categoria, endereco, latitude, longitude } = req.body;
    
        const novoLocal = await PoiUser.create({
        nome,
        descricao,
        categoria,
        endereco,
        localizacao: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
        }
        });

        res.status(201).json(novoLocal);
    }catch (error) {
        console.log(error);
        res.status(400).json(error);
    }
}

export async function updatePoiUser(req, res) {
    try {
        const { id } = req.params;
        const { nome, descricao, categoria, endereco, latitude, longitude } = req.body;

        const local = await PoiUser.findByPk(id);
        if (!local) {
            return res.status(404).json({ message: "Local não encontrado" });
        }

        local.update({
            nome,
            descricao,
            categoria,
            endereco,
            localizacao: {
                type: 'Point',
                coordinates: [parseFloat(longitude), parseFloat(latitude)]
            }
        });

        res.status(200).json(local);
    } catch (error) {
        console.log(error);
        res.status(400).json(error);
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
        res.status(204).json({ message: "Local deletado com sucesso" });
    } catch (error) {
        console.log(error);
        res.status(400).json(error);
    }
}