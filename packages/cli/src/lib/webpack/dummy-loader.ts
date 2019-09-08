module.exports = function (source: any, map: any) {
	(this as any).callback(null, source, map);
};
