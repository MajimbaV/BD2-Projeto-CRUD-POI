import express from "express";
import { getEscolasProximas, getEscolasBbox, getEscolaById } from "../controller/EscolaController.js";

const EscolaRouter = express.Router();

// Busca escolas em um raio a partir de latitude e longitude
EscolaRouter.get("/proximas", getEscolasProximas);

// Busca escolas contidas na área visível da tela (Bounding Box)
EscolaRouter.get("/bbox", getEscolasBbox);

// Consulta uma escola por ID ou CO_ESCOLA
EscolaRouter.get("/:id", getEscolaById);

export default EscolaRouter;
