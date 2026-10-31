import express from "express";
import {getAllPoiUser, createPoiUser} from "../controller/PoiUserController.js";

const PoiUserRouter = express.Router();


PoiUserRouter.get("/", getAllPoiUser);
PoiUserRouter.post("/", createPoiUser);

export default PoiUserRouter;