// Entidade dos Pontos de Interesse salvos pelo usuário, sendo o ponto de referência para buscar e classificar as escolas ao redor.

import sequelize from "../database/sequelize.js";

import { DataTypes } from "sequelize";

const PoiUser = sequelize.define(
    'PoiUser', {
        nome: {
            type: DataTypes.STRING(150),
            allowNull: false
        },
        descricao: {
            type: DataTypes.TEXT,
        },
        endereco: {
            type: DataTypes.TEXT,
        },
        categoria: {
            type: DataTypes.STRING,
            enum: ['Residêncial', 'Trabalho', 'Saúde', 'Lazer', 'Outro'],
        },
        localizacao:{
            type: DataTypes.GEOMETRY('POINT', 4326),
            allowNull: false
        },
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        }
    },
    {
        tableName: 'locais_interesse',
        underscored: true,
    }
)

PoiUser.sync();

export default PoiUser