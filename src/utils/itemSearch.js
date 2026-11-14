export function rankItems(items, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  return items
    .map((item, index) => {
      if (!normalizedQuery) return { item, index, rank: 0 };
      const name = String(item.name || '').toLowerCase();
      const sku = String(item.sku || '').toLowerCase();
      const rank = name.startsWith(normalizedQuery)
        ? 1
        : name.includes(normalizedQuery)
          ? 2
          : sku.includes(normalizedQuery)
            ? 3
            : 4;
      return { item, index, rank };
    })
    .filter(({ rank }) => !normalizedQuery || rank < 4)
    .sort((left, right) =>
      left.rank - right.rank ||
      String(left.item.name || '').localeCompare(
        String(right.item.name || ''),
        undefined,
        { sensitivity: 'base' }
      ) ||
      left.index - right.index
    )
    .map(({ item }) => item);
}

export function rankCustomers(customers, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  return customers
    .map((customer, index) => {
      const name = String(customer.name || '').toLowerCase();
      const phone = String(customer.phone || '').toLowerCase();
      const rank = !normalizedQuery
        ? 0
        : name.startsWith(normalizedQuery)
          ? 1
          : name.includes(normalizedQuery)
            ? 2
            : phone.includes(normalizedQuery)
              ? 3
              : 4;
      return { customer, index, rank };
    })
    .filter(({ rank }) => !normalizedQuery || rank < 4)
    .sort((left, right) =>
      left.rank - right.rank ||
      String(left.customer.name || '').localeCompare(
        String(right.customer.name || ''),
        undefined,
        { sensitivity: 'base' }
      ) ||
      left.index - right.index
    )
    .map(({ customer }) => customer);
}
