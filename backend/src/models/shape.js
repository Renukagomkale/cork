export const publicJson = (hidden = []) => ({
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    hidden.forEach((key) => delete ret[key]);
    return ret;
  },
});
