import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import PoiUserRouter from "./router/PoiUserRouter.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.use("/api/poiuser", PoiUserRouter);

app.listen(PORT,  () => {
    console.log(`Servidor rodando na porta ${PORT}`);
})
