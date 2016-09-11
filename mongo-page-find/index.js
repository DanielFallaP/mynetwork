exports.page=function (ctx,collection,callback){
	return new Promise((resolve, reject) => {
		var params=getQueryString(ctx.request.url);
		if (params==null){
			ctx.mongo.db('mynetwork').collection(collection).find(callback);
		}
		else{
			var options = {
				sort: "_id",
			};
			if (params.limit!=undefined)
				options.limit=parseInt(params.limit);
			if (params.skip!=undefined)
				options.skip=parseInt(params.skip);
			ctx.mongo.db('mynetwork').collection(collection).find({},options,callback);
		}
	});
}

function getQueryString(url){
	var index=url.indexOf('?');
	
	if (index>=0){
		var string=url.substring(index+1, url.length);
		var arr=string.split('&');
		var params={};
		for (var i in arr){
			var parts=arr[i].split('=');
			params[parts[0]]=parts[1];
		}
		return params;
	}
	return null;
}