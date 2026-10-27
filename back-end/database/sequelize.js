import { Sequelize } from "sequelize";
import dotenv from 'dotenv'
dotenv.config();

const sequelize = new Sequelize(
    process.env.PG_DATABASE,
    process.env.PG_USER,
    process.env.PG_PASSWORD,
    {
        host: process.env.PG_HOST,
        dialect: 'postgres'
    }
)

try {
    await sequelize.authenticate();
    console.log("Conexão bem sucedida!")
}catch (error){
    console.log("Conexão falhou:", error)
}

export default sequelize;