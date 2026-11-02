import { Sequelize } from "sequelize";
import dotenv from 'dotenv';
dotenv.config();

let sequelize;

if (process.env.DATABASE_URL) {
    sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        logging: false,
        dialectOptions: process.env.PG_SSL === 'true' ? {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        } : {}
    });
} else {
    sequelize = new Sequelize(
        process.env.PG_DATABASE || 'postgres',
        process.env.PG_USER || 'postgres',
        process.env.PG_PASSWORD || '',
        {
            host: process.env.PG_HOST || 'localhost',
            port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432,
            dialect: 'postgres',
            logging: false,
            dialectOptions: process.env.PG_SSL === 'true' ? {
                ssl: {
                    require: true,
                    rejectUnauthorized: false
                }
            } : {}
        }
    );
}

export default sequelize;