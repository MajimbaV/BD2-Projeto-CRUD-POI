// Entidade dos Pontos de Interesse salvos pelo usuário, sendo o ponto de referência para buscar e classificar as escolas ao redor.

import sequelize from "../database/sequelize.js";

import { DataTypes } from "sequelize";

const PoiUser = sequelize.define(
    'PoiUser', {
        nome: {
            type: DataTypes.STRING,
            allowNull: false
        },
        descricao: {
            type: DataTypes.STRING,
        },
        categoria: {
            type: DataTypes.STRING,
            enum: ['Residêncial', 'Trabalho', 'Saúde', 'Lazer', 'Outro'],
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

PoiUser.sync();

export default PoiUser