/* istanbul ignore file */
const logSpy = jest.spyOn(console, "log").mockImplementation();
export default logSpy;
