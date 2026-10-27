import sequelize from "../database/sequelize.js";

import { DataTypes } from "sequelize";

const PoiIE = sequelize.define(
    'PoiIE', {
        nome: {
            type: DataTypes.STRING,
            allowNull: false
        },
        descricao: {
            type: DataTypes.STRING,
        },
        categoria: {
            type: DataTypes.STRING,
            enum: ['Federal', 'Estadual', 'Municipal', 'Privada'],
        },
        niveis_ensino: {
            type: DataTypes.ARRAY(DataTypes.ENUM({
                values: ['Infantil', 'Fundamental', 'Médio', 'Superior']
            })),
        },
        localizacao:{
            type: DataTypes.GEOMETRY('POINT'),
            allowNull: false
        },
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        }
    }
)

PoiIE.sync();

export default PoiIE