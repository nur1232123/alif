// В веб-версии магазина нет: подписка работает только в режиме проверки
const Purchases = {
  configure() {},
  addCustomerInfoUpdateListener() {},
  removeCustomerInfoUpdateListener() {
    return true;
  },
  async getCustomerInfo() {
    throw new Error('нет магазина');
  },
  async getOfferings() {
    throw new Error('нет магазина');
  },
  async purchasePackage() {
    throw new Error('нет магазина');
  },
  async restorePurchases() {
    throw new Error('нет магазина');
  },
};
export default Purchases;
