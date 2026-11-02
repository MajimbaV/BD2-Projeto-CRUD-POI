import express from "express";
import {getAllPoiUser, getPoiUserById, createPoiUser, updatePoiUser, deletePoiUser} from "../controller/PoiUserController.js";

const PoiUserRouter = express.Router();


PoiUserRouter.get("/", getAllPoiUser);
PoiUserRouter.get("/:id", getPoiUserById);
PoiUserRouter.post("/", createPoiUser);
PoiUserRouter.put("/:id", updatePoiUser);
PoiUserRouter.delete("/:id", deletePoiUser);

export default PoiUserRouter;