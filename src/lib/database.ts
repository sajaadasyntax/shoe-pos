import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';

export type UserRole = 'admin' | 'sales';
export type AppUser = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
};

export type Product = {
  id: string;
  name: string;
  size: string;
  priceMinor: number;
  costMinor: number;
  stock: number;
};

export type Sale = {
  id: string;
  createdAt: string;
  paymentMethod: 'cash' | 'bank';
  totalMinor: number;
  sellerName: string;
  items: string;
  accountName: string | null;
  receiptUri: string | null;
  shareStatus: 'pending' | 'opened' | 'confirmed' | 'skipped';
};

export type Expense = {
  id: string;
  createdAt: string;
  userId: string;
  userName: string;
  category: string;
  amountMinor: number;
  paymentMethod: 'cash' | 'bank';
  note: string | null;
  receiptUri: string | null;
  accountName: string | null;
};

export type Procurement = {
  id: string;
  createdAt: string;
  supplier: string;
  createdBy: string;
  productName: string;
  size: string;
  quantity: number;
  unitCostMinor: number;
  totalMinor: number;
  receiptUri: string | null;
  paidMinor: number;
  accountId: string | null;
};

export type Account = {
  id: string;
  name: string;
  kind: 'cash' | 'bank';
  balanceMinor: number;
};

export type AccountMovement = {
  id: string;
  accountName: string;
  amountMinor: number;
  movementType: 'opening_balance' | 'sale' | 'expense' | 'procurement' | 'transfer_in' | 'transfer_out' | 'adjustment';
  note: string | null;
  createdAt: string;
  createdByName: string;
};

export type ReportSummary = {
  salesCount: number;
  salesMinor: number;
  procurementCount: number;
  procurementMinor: number;
  expenseCount: number;
  expenseMinor: number;
  costOfGoodsMinor: number;
  grossProfitMinor: number;
  netProfitMinor: number;
};

const PIN_KEY_NAME = 'solepos.pin-key';
export const DATABASE_SCHEMA_VERSION = 8;

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const versionResult = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = versionResult?.user_version ?? 0;

  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE products (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        size TEXT NOT NULL,
        price_minor INTEGER NOT NULL CHECK (price_minor > 0),
        cost_minor INTEGER NOT NULL CHECK (cost_minor >= 0),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        UNIQUE (name, size)
      );

      CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY NOT NULL,
        product_id TEXT NOT NULL REFERENCES products(id),
        quantity_delta INTEGER NOT NULL CHECK (quantity_delta != 0),
        reason TEXT NOT NULL CHECK (reason IN ('opening_stock', 'sale')),
        source_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE sales (
        id TEXT PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank')),
        total_minor INTEGER NOT NULL CHECK (total_minor > 0),
        seller_name TEXT NOT NULL
      );

      CREATE TABLE sale_lines (
        id TEXT PRIMARY KEY NOT NULL,
        sale_id TEXT NOT NULL REFERENCES sales(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        product_name TEXT NOT NULL,
        size TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor > 0),
        unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0)
      );

      CREATE INDEX stock_movements_product_id_idx ON stock_movements(product_id);
      CREATE INDEX sales_created_at_idx ON sales(created_at);
    `);
  }
  if (version < 2) {
    await db.execAsync(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('admin', 'sales')),
        pin_salt TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL
      );
      PRAGMA user_version = 2;
    `);
  }
  if (version < 3) {
    await db.execAsync(`
      ALTER TABLE sales ADD COLUMN seller_id TEXT REFERENCES users(id);
      PRAGMA user_version = 3;
    `);
  }
  if (version < 4) {
    await db.execAsync(`
      CREATE TABLE stock_movements_v4 (
        id TEXT PRIMARY KEY NOT NULL,
        product_id TEXT NOT NULL REFERENCES products(id),
        quantity_delta INTEGER NOT NULL CHECK (quantity_delta != 0),
        reason TEXT NOT NULL CHECK (reason IN ('opening_stock', 'sale', 'procurement')),
        source_id TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO stock_movements_v4 (id, product_id, quantity_delta, reason, source_id, created_at)
        SELECT id, product_id, quantity_delta, reason, source_id, created_at FROM stock_movements;
      DROP INDEX IF EXISTS stock_movements_product_id_idx;
      DROP TABLE stock_movements;
      ALTER TABLE stock_movements_v4 RENAME TO stock_movements;
      CREATE INDEX stock_movements_product_id_idx ON stock_movements(product_id);

      CREATE TABLE expenses (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        category TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank')),
        note TEXT,
        receipt_uri TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE procurements (
        id TEXT PRIMARY KEY NOT NULL,
        supplier TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id),
        total_minor INTEGER NOT NULL CHECK (total_minor > 0),
        created_at TEXT NOT NULL
      );

      CREATE TABLE procurement_lines (
        id TEXT PRIMARY KEY NOT NULL,
        procurement_id TEXT NOT NULL REFERENCES procurements(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        product_name TEXT NOT NULL,
        size TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0)
      );

      CREATE INDEX expenses_user_created_idx ON expenses(user_id, created_at);
      CREATE INDEX procurements_created_idx ON procurements(created_at);
      PRAGMA user_version = 4;
    `);
  }
  if (version < 5) {
    await db.execAsync(`
      ALTER TABLE procurements ADD COLUMN receipt_uri TEXT;
      PRAGMA user_version = 5;
    `);
  }
  if (version < 6) {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync(`
        CREATE TABLE accounts (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          kind TEXT NOT NULL CHECK (kind IN ('cash', 'bank')),
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          created_at TEXT NOT NULL
        );

        CREATE TABLE account_movements (
          id TEXT PRIMARY KEY NOT NULL,
          account_id TEXT NOT NULL REFERENCES accounts(id),
          amount_minor INTEGER NOT NULL CHECK (amount_minor != 0),
          movement_type TEXT NOT NULL CHECK (
            movement_type IN ('opening_balance', 'sale', 'expense', 'procurement', 'transfer_in', 'transfer_out')
          ),
          source_id TEXT,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL
        );

        INSERT INTO accounts (id, name, kind, created_at)
          VALUES ('account-cash', 'Cash', 'cash', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

        ALTER TABLE sales ADD COLUMN account_id TEXT REFERENCES accounts(id);
        ALTER TABLE expenses ADD COLUMN account_id TEXT REFERENCES accounts(id);
        ALTER TABLE procurements ADD COLUMN paid_minor INTEGER NOT NULL DEFAULT 0 CHECK (paid_minor >= 0);
        ALTER TABLE procurements ADD COLUMN account_id TEXT REFERENCES accounts(id);

        CREATE INDEX account_movements_account_created_idx
          ON account_movements(account_id, created_at);
        PRAGMA user_version = 6;
      `);
    });
  }
  if (version < 7) {
    await db.execAsync(`
      ALTER TABLE sales ADD COLUMN receipt_uri TEXT;
      CREATE TABLE whatsapp_share_status (
        sale_id TEXT PRIMARY KEY NOT NULL REFERENCES sales(id),
        status TEXT NOT NULL CHECK (status IN ('opened', 'confirmed', 'skipped')),
        updated_at TEXT NOT NULL
      );
      PRAGMA user_version = 7;
    `);
  }
  if (version < 8) {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync(`
        ALTER TABLE account_movements RENAME TO account_movements_v7;
        CREATE TABLE account_movements (
          id TEXT PRIMARY KEY NOT NULL,
          account_id TEXT NOT NULL REFERENCES accounts(id),
          amount_minor INTEGER NOT NULL CHECK (amount_minor != 0),
          movement_type TEXT NOT NULL CHECK (
            movement_type IN ('opening_balance', 'sale', 'expense', 'procurement', 'transfer_in', 'transfer_out', 'adjustment')
          ),
          source_id TEXT,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL,
          note TEXT
        );
        INSERT INTO account_movements
          (id, account_id, amount_minor, movement_type, source_id, created_by, created_at)
        SELECT id, account_id, amount_minor, movement_type, source_id, created_by, created_at
        FROM account_movements_v7;
        DROP TABLE account_movements_v7;
        CREATE INDEX account_movements_account_created_idx
          ON account_movements(account_id, created_at);
        PRAGMA user_version = ${DATABASE_SCHEMA_VERSION};
      `);
    });
  }
}

export async function getTodaysSales(db: SQLiteDatabase, actor: AppUser): Promise<Sale[]> {
  return db.getAllAsync<Sale>(`
    SELECT
      s.id,
      s.created_at AS createdAt,
      s.payment_method AS paymentMethod,
      s.total_minor AS totalMinor,
      s.seller_name AS sellerName,
      a.name AS accountName,
      s.receipt_uri AS receiptUri,
      COALESCE(w.status, 'pending') AS shareStatus,
      group_concat(sl.product_name || ' (' || sl.size || ') × ' || sl.quantity, ', ') AS items
    FROM sales s
    JOIN sale_lines sl ON sl.sale_id = s.id
    LEFT JOIN accounts a ON a.id = s.account_id
    LEFT JOIN whatsapp_share_status w ON w.sale_id = s.id
    WHERE date(s.created_at, 'localtime') = date('now', 'localtime')
      AND (? = 'admin' OR s.seller_id = ?)
    GROUP BY s.id
    ORDER BY s.created_at
  `, actor.role, actor.id);
}

export async function updateShareStatus(
  db: SQLiteDatabase,
  actor: AppUser,
  saleId: string,
  status: 'opened' | 'confirmed' | 'skipped',
): Promise<void> {
  const sale = await db.getFirstAsync<{ sellerId: string | null }>(
    'SELECT seller_id AS sellerId FROM sales WHERE id = ?',
    saleId,
  );
  if (!sale || (actor.role !== 'admin' && sale.sellerId !== actor.id)) {
    throw new Error('You do not have access to update sharing status for this sale.');
  }
  await db.runAsync(
    `INSERT INTO whatsapp_share_status (sale_id, status, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(sale_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
    saleId,
    status,
    new Date().toISOString(),
  );
}

export async function getProducts(db: SQLiteDatabase): Promise<Product[]> {
  return db.getAllAsync<Product>(`
    SELECT
      p.id,
      p.name,
      p.size,
      p.price_minor AS priceMinor,
      p.cost_minor AS costMinor,
      COALESCE(SUM(sm.quantity_delta), 0) AS stock
    FROM products p
    LEFT JOIN stock_movements sm ON sm.product_id = p.id
    WHERE p.active = 1
    GROUP BY p.id
    ORDER BY p.name COLLATE NOCASE, p.size
  `);
}

export async function getSales(db: SQLiteDatabase, actor: AppUser): Promise<Sale[]> {
  return db.getAllAsync<Sale>(`
    SELECT
      s.id,
      s.created_at AS createdAt,
      s.payment_method AS paymentMethod,
      s.total_minor AS totalMinor,
      s.seller_name AS sellerName,
      a.name AS accountName,
      s.receipt_uri AS receiptUri,
      COALESCE(w.status, 'pending') AS shareStatus,
      group_concat(sl.product_name || ' (' || sl.size || ') × ' || sl.quantity, ', ') AS items
    FROM sales s
    JOIN sale_lines sl ON sl.sale_id = s.id
    LEFT JOIN accounts a ON a.id = s.account_id
    LEFT JOIN whatsapp_share_status w ON w.sale_id = s.id
    WHERE (? = 'admin' OR s.seller_id = ?)
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `, actor.role, actor.id);
}

export async function getExpenses(db: SQLiteDatabase, actor: AppUser): Promise<Expense[]> {
  return db.getAllAsync<Expense>(
    `SELECT
       e.id,
       e.created_at AS createdAt,
       e.user_id AS userId,
       u.name AS userName,
       e.category,
       e.amount_minor AS amountMinor,
       e.payment_method AS paymentMethod,
       e.note,
       e.receipt_uri AS receiptUri,
       a.name AS accountName
     FROM expenses e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN accounts a ON a.id = e.account_id
     WHERE (? = 'admin' OR e.user_id = ?)
     ORDER BY e.created_at DESC`,
    actor.role,
    actor.id,
  );
}

export async function createExpense(
  db: SQLiteDatabase,
  actor: AppUser,
  input: {
    category: string;
    amountMinor: number;
    paymentMethod: 'cash' | 'bank';
    accountId: string;
    note: string;
    receiptUri: string | null;
  },
): Promise<void> {
  const category = input.category.trim();
  const note = input.note.trim();
  if (!category || category.length > 60) throw new Error('Enter an expense category (up to 60 characters).');
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('Enter a valid expense amount greater than zero.');
  }
  if (note.length > 500) throw new Error('Expense notes must be 500 characters or fewer.');

  if (!input.accountId) throw new Error('Choose the cash or bank account used for this expense.');
  const expenseId = Crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const account = await getAccountForTransaction(transaction, input.accountId);
    if (account.kind !== input.paymentMethod) {
      throw new Error('Payment method must match the selected account type.');
    }
    await requireSufficientBalance(transaction, input.accountId, input.amountMinor);
    await transaction.runAsync(
      `INSERT INTO expenses
         (id, user_id, category, amount_minor, payment_method, account_id, note, receipt_uri, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      expenseId,
      actor.id,
      category,
      input.amountMinor,
      input.paymentMethod,
      input.accountId,
      note || null,
      input.receiptUri,
      createdAt,
    );
    await transaction.runAsync(
      `INSERT INTO account_movements
         (id, account_id, amount_minor, movement_type, source_id, created_by, created_at)
       VALUES (?, ?, ?, 'expense', ?, ?, ?)`,
      Crypto.randomUUID(),
      input.accountId,
      -input.amountMinor,
      expenseId,
      actor.id,
      createdAt,
    );
  });
}

export async function getProcurements(db: SQLiteDatabase, actor: AppUser): Promise<Procurement[]> {
  assertAdmin(actor);
  return db.getAllAsync<Procurement>(`
    SELECT
      p.id,
      p.created_at AS createdAt,
      p.supplier,
      u.name AS createdBy,
      pl.product_name AS productName,
      pl.size,
      pl.quantity,
      pl.unit_cost_minor AS unitCostMinor,
      p.total_minor AS totalMinor,
      p.receipt_uri AS receiptUri,
      p.paid_minor AS paidMinor,
      p.account_id AS accountId
    FROM procurements p
    JOIN users u ON u.id = p.created_by
    JOIN procurement_lines pl ON pl.procurement_id = p.id
    ORDER BY p.created_at DESC
  `);
}

export async function createProcurement(
  db: SQLiteDatabase,
  actor: AppUser,
  input: {
    supplier: string;
    productId: string;
    quantity: number;
    unitCostMinor: number;
    receiptUri: string | null;
    paidMinor: number;
    accountId: string | null;
  },
): Promise<void> {
  assertAdmin(actor);
  const supplier = input.supplier.trim();
  if (!supplier || supplier.length > 120) {
    throw new Error('Enter a supplier name (up to 120 characters).');
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw new Error('Procurement quantity must be a whole number greater than zero.');
  }
  if (!Number.isSafeInteger(input.unitCostMinor) || input.unitCostMinor < 0) {
    throw new Error('Enter a valid unit cost.');
  }
  const totalMinor = input.unitCostMinor * input.quantity;
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    throw new Error('Procurement total must be greater than zero and within the supported amount range.');
  }
  if (!Number.isSafeInteger(input.paidMinor) || input.paidMinor < 0 || input.paidMinor > totalMinor) {
    throw new Error('Amount paid must be between zero and the procurement total.');
  }
  if ((input.paidMinor === 0) !== (input.accountId === null)) {
    throw new Error('Choose an account when paying now, or leave the account blank when the purchase is unpaid.');
  }

  const procurementId = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const product = await transaction.getFirstAsync<{ name: string; size: string }>(
      'SELECT name, size FROM products WHERE id = ? AND active = 1',
      input.productId,
    );
    if (!product) throw new Error('The selected product is no longer available.');
    if (input.accountId) {
      await getAccountForTransaction(transaction, input.accountId);
      await requireSufficientBalance(transaction, input.accountId, input.paidMinor);
    }

    await transaction.runAsync(
      `INSERT INTO procurements
         (id, supplier, created_by, total_minor, receipt_uri, paid_minor, account_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      procurementId,
      supplier,
      actor.id,
      totalMinor,
      input.receiptUri,
      input.paidMinor,
      input.accountId,
      now,
    );
    await transaction.runAsync(
      `INSERT INTO procurement_lines
         (id, procurement_id, product_id, product_name, size, quantity, unit_cost_minor)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      Crypto.randomUUID(),
      procurementId,
      input.productId,
      product.name,
      product.size,
      input.quantity,
      input.unitCostMinor,
    );
    await transaction.runAsync(
      `INSERT INTO stock_movements (id, product_id, quantity_delta, reason, source_id, created_at)
       VALUES (?, ?, ?, 'procurement', ?, ?)`,
      Crypto.randomUUID(),
      input.productId,
      input.quantity,
      procurementId,
      now,
    );
    if (input.accountId && input.paidMinor > 0) {
      await transaction.runAsync(
        `INSERT INTO account_movements
           (id, account_id, amount_minor, movement_type, source_id, created_by, created_at)
         VALUES (?, ?, ?, 'procurement', ?, ?, ?)`,
        Crypto.randomUUID(),
        input.accountId,
        -input.paidMinor,
        procurementId,
        actor.id,
        now,
      );
    }
  });
}

export async function storeReceiptImage(sourceUri: string, mimeType?: string | null): Promise<string> {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const directory = new Directory(Paths.document, 'receipts');
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, `${Crypto.randomUUID()}.${extension}`);
  await new File(sourceUri).copy(destination);
  return destination.uri;
}

export async function deleteReceiptImage(uri: string): Promise<void> {
  const file = new File(uri);
  if (file.exists) file.delete();
}

export async function createProduct(
  db: SQLiteDatabase,
  actor: AppUser,
  input: { name: string; size: string; priceMinor: number; costMinor: number; openingStock: number },
): Promise<void> {
  assertAdmin(actor);
  const name = input.name.trim();
  const size = input.size.trim();

  if (!name || !size) {
    throw new Error('Enter both a product name and shoe size.');
  }
  if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor <= 0) {
    throw new Error('Enter a valid selling price greater than zero.');
  }
  if (!Number.isSafeInteger(input.costMinor) || input.costMinor < 0) {
    throw new Error('Enter a valid cost price.');
  }
  if (!Number.isSafeInteger(input.openingStock) || input.openingStock < 0) {
    throw new Error('Opening stock must be a whole number zero or greater.');
  }

  const productId = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO products (id, name, size, price_minor, cost_minor, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      productId,
      name,
      size,
      input.priceMinor,
      input.costMinor,
      now,
    );

    if (input.openingStock > 0) {
      await transaction.runAsync(
        `INSERT INTO stock_movements (id, product_id, quantity_delta, reason, created_at)
         VALUES (?, ?, ?, 'opening_stock', ?)`,
        Crypto.randomUUID(),
        productId,
        input.openingStock,
        now,
      );
    }
  });
}

export async function updateProductPrices(
  db: SQLiteDatabase,
  actor: AppUser,
  productId: string,
  priceMinor: number,
  costMinor: number,
): Promise<void> {
  assertAdmin(actor);
  if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0) {
    throw new Error('Enter a valid selling price greater than zero.');
  }
  if (!Number.isSafeInteger(costMinor) || costMinor < 0) {
    throw new Error('Enter a valid cost price.');
  }
  const result = await db.runAsync(
    'UPDATE products SET price_minor = ?, cost_minor = ? WHERE id = ? AND active = 1',
    priceMinor,
    costMinor,
    productId,
  );
  if (result.changes !== 1) throw new Error('This item is no longer available to edit.');
}

export async function createSale(
  db: SQLiteDatabase,
  actor: AppUser,
  product: Product,
  quantity: number,
  accountId: string,
  receiptUri: string | null,
): Promise<void> {
  if (!accountId) throw new Error('Choose a payment account for this sale.');
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error('Sale quantity must be a whole number greater than zero.');
  }

  const saleId = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const account = await getAccountForTransaction(transaction, accountId);
    const stockResult = await transaction.getFirstAsync<{ stock: number }>(
      `SELECT COALESCE(SUM(quantity_delta), 0) AS stock
       FROM stock_movements WHERE product_id = ?`,
      product.id,
    );
    const stock = stockResult?.stock ?? 0;
    if (quantity > stock) {
      throw new Error(`Only ${stock} pair${stock === 1 ? '' : 's'} available in this size.`);
    }

    const totalMinor = product.priceMinor * quantity;
    if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
      throw new Error('Sale total is outside the supported amount range.');
    }

    await transaction.runAsync(
      `INSERT INTO sales
         (id, created_at, payment_method, total_minor, seller_name, seller_id, account_id, receipt_uri)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      saleId,
      now,
      account.kind,
      totalMinor,
      actor.name,
      actor.id,
      accountId,
      receiptUri,
    );
    await transaction.runAsync(
      `INSERT INTO sale_lines
         (id, sale_id, product_id, product_name, size, quantity, unit_price_minor, unit_cost_minor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      Crypto.randomUUID(),
      saleId,
      product.id,
      product.name,
      product.size,
      quantity,
      product.priceMinor,
      product.costMinor,
    );
    await transaction.runAsync(
      `INSERT INTO stock_movements (id, product_id, quantity_delta, reason, source_id, created_at)
       VALUES (?, ?, ?, 'sale', ?, ?)`,
      Crypto.randomUUID(),
      product.id,
      -quantity,
      saleId,
      now,
    );
    await transaction.runAsync(
      `INSERT INTO account_movements
         (id, account_id, amount_minor, movement_type, source_id, created_by, created_at)
       VALUES (?, ?, ?, 'sale', ?, ?, ?)`,
      Crypto.randomUUID(),
      accountId,
      totalMinor,
      saleId,
      actor.id,
      now,
    );
  });
}

export async function getAccounts(db: SQLiteDatabase, actor: AppUser): Promise<Account[]> {
  assertAdmin(actor);
  return db.getAllAsync<Account>(`
    SELECT a.id, a.name, a.kind,
      COALESCE(SUM(m.amount_minor), 0) AS balanceMinor
    FROM accounts a
    LEFT JOIN account_movements m ON m.account_id = a.id
    WHERE a.active = 1
    GROUP BY a.id
    ORDER BY CASE a.kind WHEN 'cash' THEN 0 ELSE 1 END, a.name COLLATE NOCASE
  `);
}

export async function getRecentAccountMovements(
  db: SQLiteDatabase,
  actor: AppUser,
  limit = 40,
): Promise<AccountMovement[]> {
  assertAdmin(actor);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Account history limit must be between 1 and 100.');
  }
  return db.getAllAsync<AccountMovement>(
    `SELECT m.id, a.name AS accountName, m.amount_minor AS amountMinor,
       m.movement_type AS movementType, m.note, m.created_at AS createdAt,
       u.name AS createdByName
     FROM account_movements m
     JOIN accounts a ON a.id = m.account_id
     JOIN users u ON u.id = m.created_by
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT ?`,
    limit,
  );
}

export async function getPaymentAccounts(db: SQLiteDatabase): Promise<Account[]> {
  return db.getAllAsync<Account>(`
    SELECT a.id, a.name, a.kind,
      COALESCE(SUM(m.amount_minor), 0) AS balanceMinor
    FROM accounts a
    LEFT JOIN account_movements m ON m.account_id = a.id
    WHERE a.active = 1
    GROUP BY a.id
    ORDER BY CASE a.kind WHEN 'cash' THEN 0 ELSE 1 END, a.name COLLATE NOCASE
  `);
}

export async function createBankAccount(
  db: SQLiteDatabase,
  actor: AppUser,
  input: { name: string; openingBalanceMinor: number },
): Promise<void> {
  assertAdmin(actor);
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new Error('Enter a bank account name (2-80 characters).');
  if (!Number.isSafeInteger(input.openingBalanceMinor) || input.openingBalanceMinor < 0) {
    throw new Error('Opening balance must be a valid amount of zero or more.');
  }
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        'INSERT INTO accounts (id, name, kind, created_at) VALUES (?, ?, \'bank\', ?)',
        id,
        name,
        now,
      );
      if (input.openingBalanceMinor > 0) {
        await transaction.runAsync(
          `INSERT INTO account_movements
             (id, account_id, amount_minor, movement_type, source_id, created_by, created_at)
           VALUES (?, ?, ?, 'opening_balance', ?, ?, ?)`,
          Crypto.randomUUID(),
          id,
          input.openingBalanceMinor,
          id,
          actor.id,
          now,
        );
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
      throw new Error('An account with that name already exists.');
    }
    throw error;
  }
}

export async function addOpeningBalance(
  db: SQLiteDatabase,
  actor: AppUser,
  accountId: string,
  amountMinor: number,
): Promise<void> {
  assertAdmin(actor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('Opening balance must be greater than zero.');
  }
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await getAccountForTransaction(transaction, accountId);
    await transaction.runAsync(
      `INSERT INTO account_movements
         (id, account_id, amount_minor, movement_type, source_id, created_by, created_at)
       VALUES (?, ?, ?, 'opening_balance', ?, ?, ?)`,
      Crypto.randomUUID(),
      accountId,
      amountMinor,
      Crypto.randomUUID(),
      actor.id,
      now,
    );
  });
}

export async function recordAccountAdjustment(
  db: SQLiteDatabase,
  actor: AppUser,
  accountId: string,
  amountMinor: number,
  reason: string,
): Promise<void> {
  assertAdmin(actor);
  const note = reason.trim();
  if (!Number.isSafeInteger(amountMinor) || amountMinor === 0) {
    throw new Error('Enter a non-zero correction amount. Use a minus sign to decrease the balance.');
  }
  if (note.length < 5 || note.length > 200) {
    throw new Error('Enter a correction reason between 5 and 200 characters.');
  }
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await getAccountForTransaction(transaction, accountId);
    await transaction.runAsync(
      `INSERT INTO account_movements
         (id, account_id, amount_minor, movement_type, source_id, created_by, created_at, note)
       VALUES (?, ?, ?, 'adjustment', ?, ?, ?, ?)`,
      Crypto.randomUUID(),
      accountId,
      amountMinor,
      Crypto.randomUUID(),
      actor.id,
      new Date().toISOString(),
      note,
    );
  });
}

export async function transferBetweenAccounts(
  db: SQLiteDatabase,
  actor: AppUser,
  sourceAccountId: string,
  destinationAccountId: string,
  amountMinor: number,
): Promise<void> {
  assertAdmin(actor);
  if (sourceAccountId === destinationAccountId) throw new Error('Choose two different accounts.');
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('Transfer amount must be greater than zero.');
  }
  const transferId = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await getAccountForTransaction(transaction, sourceAccountId);
    await getAccountForTransaction(transaction, destinationAccountId);
    await requireSufficientBalance(transaction, sourceAccountId, amountMinor);
    await transaction.runAsync(
      `INSERT INTO account_movements
         (id, account_id, amount_minor, movement_type, source_id, created_by, created_at)
       VALUES (?, ?, ?, 'transfer_out', ?, ?, ?)`,
      Crypto.randomUUID(),
      sourceAccountId,
      -amountMinor,
      transferId,
      actor.id,
      now,
    );
    await transaction.runAsync(
      `INSERT INTO account_movements
         (id, account_id, amount_minor, movement_type, source_id, created_by, created_at)
       VALUES (?, ?, ?, 'transfer_in', ?, ?, ?)`,
      Crypto.randomUUID(),
      destinationAccountId,
      amountMinor,
      transferId,
      actor.id,
      now,
    );
  });
}

async function getAccountForTransaction(
  transaction: SQLiteDatabase,
  accountId: string,
): Promise<{ id: string; name: string; kind: 'cash' | 'bank' }> {
  const account = await transaction.getFirstAsync<{ id: string; name: string; kind: 'cash' | 'bank' }>(
    'SELECT id, name, kind FROM accounts WHERE id = ? AND active = 1',
    accountId,
  );
  if (!account) throw new Error('The selected financial account is unavailable.');
  return account;
}

async function requireSufficientBalance(
  transaction: SQLiteDatabase,
  accountId: string,
  amountMinor: number,
): Promise<void> {
  const row = await transaction.getFirstAsync<{ balanceMinor: number }>(
    'SELECT COALESCE(SUM(amount_minor), 0) AS balanceMinor FROM account_movements WHERE account_id = ?',
    accountId,
  );
  if ((row?.balanceMinor ?? 0) < amountMinor) {
    throw new Error('The selected account does not have enough recorded balance.');
  }
}

export async function getReportSummary(
  db: SQLiteDatabase,
  actor: AppUser,
  startDate: string,
  endDate: string,
): Promise<ReportSummary> {
  assertAdmin(actor);
  validateDateRange(startDate, endDate);
  const range = [startDate, endDate];
  const [sales, procurements, expenses, costs] = await Promise.all([
    db.getFirstAsync<{ count: number; total: number }>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_minor), 0) AS total
       FROM sales WHERE date(created_at, 'localtime') BETWEEN ? AND ?`,
      ...range,
    ),
    db.getFirstAsync<{ count: number; total: number }>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_minor), 0) AS total
       FROM procurements WHERE date(created_at, 'localtime') BETWEEN ? AND ?`,
      ...range,
    ),
    db.getFirstAsync<{ count: number; total: number }>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount_minor), 0) AS total
       FROM expenses WHERE date(created_at, 'localtime') BETWEEN ? AND ?`,
      ...range,
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(sl.quantity * sl.unit_cost_minor), 0) AS total
       FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
       WHERE date(s.created_at, 'localtime') BETWEEN ? AND ?`,
      ...range,
    ),
  ]);
  const salesMinor = sales?.total ?? 0;
  const costOfGoodsMinor = costs?.total ?? 0;
  const grossProfitMinor = salesMinor - costOfGoodsMinor;
  const expenseMinor = expenses?.total ?? 0;
  return {
    salesCount: sales?.count ?? 0,
    salesMinor,
    procurementCount: procurements?.count ?? 0,
    procurementMinor: procurements?.total ?? 0,
    expenseCount: expenses?.count ?? 0,
    expenseMinor,
    costOfGoodsMinor,
    grossProfitMinor,
    netProfitMinor: grossProfitMinor - expenseMinor,
  };
}

function validateDateRange(startDate: string, endDate: string): void {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day;
  };
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    throw new Error('Enter a valid date range using YYYY-MM-DD.');
  }
}

export async function getUserCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM users');
  return row?.count ?? 0;
}

export async function getUserById(db: SQLiteDatabase, id: string): Promise<AppUser | null> {
  const row = await db.getFirstAsync<AppUser>(
    `SELECT id, name, username, role FROM users WHERE id = ? AND active = 1`,
    id,
  );
  return row ?? null;
}

export async function authenticateUser(
  db: SQLiteDatabase,
  username: string,
  pin: string,
): Promise<AppUser | null> {
  const normalizedUsername = username.trim();
  const user = await db.getFirstAsync<AppUser & { pinSalt: string; pinHash: string }>(
    `SELECT id, name, username, role, pin_salt AS pinSalt, pin_hash AS pinHash
     FROM users WHERE username = ? COLLATE NOCASE AND active = 1`,
    normalizedUsername,
  );
  if (!user || !isValidPin(pin)) return null;
  const expectedHash = await hashPin(user.pinSalt, pin);
  if (expectedHash !== user.pinHash) return null;
  return { id: user.id, name: user.name, username: user.username, role: user.role };
}

export async function createInitialAdmin(
  db: SQLiteDatabase,
  input: { name: string; username: string; pin: string },
): Promise<AppUser> {
  if (await getUserCount(db) > 0) {
    throw new Error('An account already exists. Sign in with an admin account instead.');
  }
  return createUser(db, input, 'admin');
}

export async function createSalesUser(
  db: SQLiteDatabase,
  actor: AppUser,
  input: { name: string; username: string; pin: string },
): Promise<AppUser> {
  assertAdmin(actor);
  return createUser(db, input, 'sales');
}

export async function getUsers(db: SQLiteDatabase, actor: AppUser): Promise<AppUser[]> {
  assertAdmin(actor);
  return db.getAllAsync<AppUser>(
    'SELECT id, name, username, role FROM users WHERE active = 1 ORDER BY role, name COLLATE NOCASE',
  );
}

async function createUser(
  db: SQLiteDatabase,
  input: { name: string; username: string; pin: string },
  role: UserRole,
): Promise<AppUser> {
  const name = input.name.trim();
  const username = input.username.trim().toLowerCase();
  if (name.length < 2) throw new Error('Enter a name with at least two characters.');
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    throw new Error('Username must be 3-32 letters, numbers, dots, underscores, or hyphens.');
  }
  if (!isValidPin(input.pin)) throw new Error('PIN must contain 6–12 digits.');

  const user = { id: Crypto.randomUUID(), name, username, role };
  const pinSalt = Crypto.randomUUID();
  const pinHash = await hashPin(pinSalt, input.pin);
  try {
    await db.runAsync(
      `INSERT INTO users (id, name, username, role, pin_salt, pin_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      user.name,
      user.username,
      user.role,
      pinSalt,
      pinHash,
      new Date().toISOString(),
    );
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
      throw new Error('That username is already in use.');
    }
    throw error;
  }
  return user;
}

async function hashPin(salt: string, pin: string): Promise<string> {
  let deviceKey = await SecureStore.getItemAsync(PIN_KEY_NAME);
  if (!deviceKey) {
    deviceKey = `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
    await SecureStore.setItemAsync(PIN_KEY_NAME, deviceKey);
  }
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${deviceKey}:${salt}:${pin}`,
  );
}

function isValidPin(pin: string): boolean {
  return /^\d{6,12}$/.test(pin);
}

function assertAdmin(actor: AppUser): void {
  if (actor.role !== 'admin') {
    throw new Error('Only an admin can manage the product catalog or user accounts.');
  }
}

export function parseAmountToMinorUnits(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const [whole, fraction = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function formatAmount(minor: number): string {
  return new Intl.NumberFormat('ar', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
