import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import PoiUserRouter from "./router/PoiUserRouter.js";
import PoiUser from "./model/PoiUser.js";
import sequelize from "./database/sequelize.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 3000;

app.use("/api/poiuser", PoiUserRouter);

try {
    if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
        throw new Error("API_PORT deve ser um número inteiro entre 1 e 65535.");
    }

    await sequelize.authenticate();
    console.log("Conexão com o banco de dados estabelecida.");
    await PoiUser.sync();

    app.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });
} catch (error) {
    console.error("Falha ao iniciar o servidor:", error);
    try {
        await sequelize.close();
    } catch (closeError) {
        console.error("Falha ao encerrar a conexão com o banco de dados:", closeError);
    }
    process.exitCode = 1;
}
