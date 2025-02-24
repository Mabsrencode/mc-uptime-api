const environments = {
  JWT: process.env.JWT_SECRET as string,
  EMAIL_USER: process.env.EMAIL_USER as string,
  EMAIL_PASS: process.env.EMAIL_PASS as string,
};

export default environments;
