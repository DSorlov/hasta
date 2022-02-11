import Sqlite from 'better-sqlite3';
import sqlString from 'sqlstring-sqlite';
const dbs = {};

async function open(database,path) {
  dbs[database] = new Sqlite(path, { fileMustExist: false });
}

// eslint-disable-next-line max-params
async function query(database, table, where = {}, select = [], orderBy = [], join ="") {
  const tableName = sqlString.escapeId(table);
  const selectClause = formatSelectClause(select);
  const whereClause = formatWhereClauses(where);
  const orderByClause = formatOrderByClause(orderBy);
  const joinClause = join;

  console.log(`${selectClause} FROM ${tableName} ${joinClause} ${whereClause} ${orderByClause};`);

  return dbs[database].prepare(`${selectClause} FROM ${tableName} ${joinClause} ${whereClause} ${orderByClause};`).all();
}

async function rawQuery(database, sql, params = []) {
  return dbs[database].prepare(sql).all(params);
}

async function exec(database, sql, params = []) {
  return dbs[database].prepare(sql).run(params);
}

function close(database) {
  delete dbs[database]
}

function formatSelectClause(fields) {

  if (Array.isArray(fields)) {
    const selectItem =
      fields.length > 0
        ? fields.map((fieldName) => sqlString.escapeId(fieldName)).join(', ')
        : '*';
    return `SELECT ${selectItem}`;
  } 

  const selectItem = Object.entries(fields).map((key)=>`${sqlString.escapeId(key[0])} AS ${sqlString.escapeId(key[1])}`).join(', ');
  return `SELECT ${selectItem}`;
  
}

function formatWhereClause(key, value) {
  if (Array.isArray(value)) {
    return `${sqlString.escapeId(key)} IN (${value
      .map((v) => sqlString.escape(v))
      .join(', ')})`;
  }

  if (value === null) {
    return `${sqlString.escapeId(key)} IS NULL`;
  }

  return `${sqlString.escapeId(key)} = ${sqlString.escape(value)}`;
}

function formatWhereClauses(query) {
  if (Object.keys(query).length === 0) {
    return '';
  }

  const whereClauses = Object.entries(query).map(([key, value]) =>
    formatWhereClause(key, value)
  );
  return `WHERE ${whereClauses.join(' AND ')}`;
}

function formatOrderByClause(orderBy) {
  let orderByClause = '';

  if (orderBy.length > 0) {
    orderByClause += 'ORDER BY ';

    orderByClause += orderBy
      .map(([key, value]) => {
        const direction = value === 'DESC' ? 'DESC' : 'ASC';
        return `${sqlString.escapeId(key)} ${direction}`;
      })
      .join(', ');
  }

  return orderByClause;
}

export default {
  open,
  query,
  exec,
  close,
  formatSelectClause,
  formatWhereClause,
  formatWhereClauses,
  formatOrderByClause
}

