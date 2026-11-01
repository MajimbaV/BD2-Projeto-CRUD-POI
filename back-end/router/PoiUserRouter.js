import express from "express";
import {getAllPoiUser, createPoiUser, updatePoiUser, deletePoiUser} from "../controller/PoiUserController.js";

const PoiUserRouter = express.Router();


PoiUserRouter.get("/", getAllPoiUser);
PoiUserRouter.post("/", createPoiUser);
PoiUserRouter.put("/:id", updatePoiUser);
PoiUserRouter.delete("/:id", deletePoiUser);

export default PoiUserRouter;