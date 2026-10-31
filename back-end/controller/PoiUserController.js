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
        const pois = await PoiUser.create(req.body);
        res.status(201).json(pois);
    }catch (error) {
        res.status(400).json(error);
    }
}