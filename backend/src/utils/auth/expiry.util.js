const isExpiredDate = (value) => {
  if (!value) {
    return false;
  }

  const expiresAt = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt.getTime() <= Date.now();
};

const getRemainingSeconds = (value) => {
  if (!value) {
    return 0;
  }

  const expiresAt = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(expiresAt.getTime())) {
    return 0;
  }

  const remainingMs = expiresAt.getTime() - Date.now();

  if (remainingMs <= 0) {
    return 0;
  }

  return Math.ceil(remainingMs / 1000);
};

module.exports = {
  isExpiredDate,
  getRemainingSeconds,
};
