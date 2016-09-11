const Koa = require('koa');
const mongo = require('koa-mongo');
const body = require('koa-better-body');
const mon = require('mongodb');
const uuid = require('uuid');
const fs = require('fs');
const CryptoJS = require("crypto-js");
const pageFind = require('mongo-page-find');
const app = new Koa();

function getMongoId(id){
	return mon.ObjectID(id);
}

var loggedInUser={
};

app.use(body());
app.use(mongo({
	  host: 'localhost',
	  port: 27017,
	  db: 'mynetwork',
	  max: 100,
	  min: 1,
	  timeout: 30000,
	  log: false
}));

/**
 * Gets user bearer token
 */
function getToken(ctx){
	
	return new Promise((resolve,reject)=>{
		ctx.mongo.db('mynetwork').collection('user').findOne({"token":ctx.request.header.authorization}, (err, doc) => {
			if (!err && doc!=null){
				loggedInUser=doc;
				resolve(ctx);
			}
			else{
				ctx.response.status=401;
				ctx.body={
					message:'Invalid token'	
				};
				reject();
			} 
		});
	});
}

/**
 * Signs up user to MY Social Network. Password is encrypted-stored.
 * e.g.: POST http://localhost:3000/signup
 * @request_headers: Content-Type: application/json
 * @payload: {"name":<name>, "password": <password>}
 * e.g. {"name":"daniel", "password": "123"}
 */
app.use((ctx, next) => {

	  if (ctx.request.method==='POST' && ctx.request.url==='/signup')
		  return new Promise((resolve, reject)=>{
			  ctx.mongo.db('mynetwork').collection('user').findOne({"name":ctx.body.name},(err,doc)=>{
				  if (!err && doc==null)
					  resolve(ctx);
				  else{
					  ctx.response.status=400;
					  ctx.body={
						  message: 'User taken!'
					  }
					  reject();
				  }
			  });
		  }).then((ctx)=>{
			  return new Promise((resolve, reject) => {
				  var pass=CryptoJS.AES.encrypt(ctx.body.password, "Secret Passphrase");
				  var user={
					 'name': ctx.body.name,
					 'password': pass.toString()
				  };
				  ctx.mongo.db('mynetwork').collection('user').insert(user, (err, doc) => {
					  if (!err){
						  ctx.body={
								  message: 'User created!'
						  }
						  resolve();
					  }
					  else{
						  ctx.response.status=400;
						  ctx.body={
							 message: 'Error'
						  }
						  resolve();
					  }
					});
			  });
		  },()=>{
			  
		  });
		  
	  return next();
});

/**
 * Logs user into MY Social Network.
 * e.g.: POST http://localhost:3000/signup
 * @request_headers: Content-Type: application/json
 * @payload: {"name":<name>, "login": <password>}
 * e.g. {"name":"daniel", "password": "123"}
 * @response: {"token":<user session token>}
 */
app.use((ctx, next)=>{
	if (ctx.request.method==='POST' && ctx.request.url==='/login'){
		 return new Promise((resolve, reject) => {
			 var token=uuid.v1();
			  ctx.mongo.db('mynetwork').collection('user').findOne({"name":ctx.body.name},(err, doc) => {
				  if (doc==null || err!=undefined){
					  ctx.response.status=400;
					  ctx.body={
						  message: 'User not found'
					  }
					  reject();
				  }
				  else{
					  if (doc.password!=undefined && CryptoJS.AES.decrypt(doc.password, "Secret Passphrase").toString(CryptoJS.enc.Utf8)===ctx.body.password){
						  resolve(token);
					  }
					  else{
						  ctx.response.status=401;
							ctx.body={
									message: 'Wrong password'
							};
						  reject();
					  }
				  }
			  });
		  },null).then((token)=>{
				return new Promise((resolve,reject)=>{
					ctx.mongo.db('mynetwork').collection('user').updateOne({"name":ctx.body.name}, {$set: { "token" : token }},(err, doc) => {
						if (!err){
							resolve(token);
						}
					});
				});
		   },
		   null).then((token)=>{
			   ctx.body={
			      token:token
			   }
		   },()=>{
			    
		   });
	}
	return next();
});

/**
 * Follows given My Social Network user in path.
 * e.g.: GET http://localhost:3000/followUser/davinci
 * @request_headers: Content-Type: application/json
 * 					 Authorization: <token returned by login method>
 */
app.use((ctx,next) => {
	if (ctx.request.method==='GET' && ctx.request.path.indexOf('/followUser/')==0){
		 return getToken(ctx)
		 .then(()=>{
			 return new Promise((resolve, reject)=>{
				 var parts=ctx.request.url.split('/');
			     var id=parts[parts.length-1];
				 ctx.mongo.db('mynetwork').collection('user').findOne({"name":id},(err,doc)=>{
					 if (!err && doc!=null)
						 resolve(ctx);
					 else{
						 ctx.response.status=400;
						 ctx.body={
								 message: 'User does not exist!'
						 }
						 reject();
					 }
				 });
			 })
		 },null).then((ctx)=>{
			return new Promise((resolve, reject) => {
		    	var parts=ctx.request.url.split('/');
		    	var id=parts[parts.length-1];
		    	if (id===loggedInUser.name){
		    		ctx.response.status=400;
		    		ctx.body={
						message: 'Cannot follow self'
					};
		    		resolve();
		    	}
		    	else{
		    		var following=id.toString();
			    	if (loggedInUser.following==undefined)loggedInUser.following=[];
			    	if (loggedInUser.friends==undefined)loggedInUser.friends=[];
			    	
			    	var friends=loggedInUser.friends;
			    	var exists=loggedInUser.following.filter(function(el){
			    		return el===following;
			    	}).length;  
			    	if (!exists){
			    		loggedInUser.following.push(following);
						  ctx.mongo.db('mynetwork').collection('user').updateOne({"name":loggedInUser.name},{ $set: { "following" : loggedInUser.following }}, (err, doc) => {
								var users=[];
								
							    for (var i in loggedInUser.following){
									users.push(new Promise((resolve,reject)=>{
										ctx.mongo.db('mynetwork').collection('user').findOne({"name":loggedInUser.following[i]}, (err, user)=>{
											if (!err && user!=undefined && user.following){
												var followsMe=user.following.filter(function(el){
													return el===loggedInUser.name;
												}).length;
												if (followsMe)
													resolve({name:user.name,friends:(user.friends!=undefined?user.friends:[])});
												else
													resolve(0);
											}
										});
									}));
								}
							    Promise.all(users).then(function(results){
							    	for (var i in results){
							    		if (results[i]!=0)
							    			friends.push(results[i].name);
							    	}
							    	if (friends.length){
							    		ctx.mongo.db('mynetwork').collection('user').updateOne({"name":loggedInUser.name},{ $set: { "friends" : friends }}, (err, doc)=>{
							    			if (!err)
							    				console.log('Updated Friends!');
							    		})
							    		for (var i in results){
							    			var fr=results[i].friends;
							    			fr.push(loggedInUser.name);
							    			ctx.mongo.db('mynetwork').collection('user').updateOne({"name":results[i].name},{ $set: { "friends" : fr }}, (err, doc)=>{
									    		console.log('friends updated'+err);
								    			if (!err)
								    				console.log('Updated Friends!');
								    		})
							    		}
							    	}
							    	
							    });
							    ctx.body={
									message: 'User followed!'
								}
								resolve();
						  });
			    	}
			    	else{
			    		ctx.response.status=400;
			    		ctx.body={
								message: 'User already followed!'
						}
						resolve();
			    	}
		    	}
			});
		  },null).then(()=>{
			  
		  },()=>{
			  
		  });
	}
	return next();
});

/**
 * Lists all users of MY Social Network.
 * e.g.: GET http://localhost:3000/listUsers
 * e.g.: GET http://localhost:3000/listUsers?skip=0&limit=10
 * @request_headers: Content-Type: application/json
 * 					 Authorization: <token returned by login method>
 */
app.use((ctx,next)=> {
	if (ctx.request.method==='GET' && ctx.request.path==='/listUsers'){
		return getToken(ctx).then((ctx)=>{
			return new Promise((resolve,reject)=>{
				pageFind.page(ctx,'user',(err, cursor) => {
					resolve(cursor);
				});
			});
		}).then((cursor)=>{
			return new Promise((resolve,reject)=>{
				cursor.toArray((err,docs)=>{
					for (var i in docs)
						delete docs[i].password;
					resolve(docs);
				});
			});
		},null).then((docs)=>{
			ctx.body={
					users: docs
			};
		},()=>{
			
		});
	}
	return next();
});

/**
 * Publishes image as post in MY Social Network.
 * e.g.: POST http://localhost:3000/postImage
 * @request_headers: Content-Type: multipart/form-data; boundary=<boundary>
					 Authorization: <token returned by login method>
 * @payload: 
 * e.g.: --<boundary>
	Content-Disposition: form-data; name="photo"
	Content-Type: image/jpeg
	Content-Transfer-Encoding: base64
	--<boundary>
	fjdfjdd=
	--<boundary>--
 */
app.use((ctx, next)=>{
	if (ctx.request.is('multipart/*') && ctx.request.method==='POST' && ctx.request.path==='/postImage'){
		return getToken(ctx)
		.then(()=>{
			var photo=ctx.request.fields.photo;
			var bytes=new Buffer(photo, 'base64');
			var name=uuid.v1();
			fs.writeFile( __dirname+'/'+name+'.jpg', bytes, 'base64');
			var post={
				url:'/'+name+'.jpg'
			}
			
			  post['datePublished']=new Date().getTime();
			  post['publishedBy']=loggedInUser.name;
			ctx.mongo.db('mynetwork').collection('post').insert(post, (err, doc) => {
			});
			ctx.body={
				message: 'Image saved'
			}
		},()=>{
			
		})
	}
	return next();
});

/**
 * Lists all posts of MY Social Network.
 * e.g.: GET http://localhost:3000/listPosts
 * e.g.: GET http://localhost:3000/listPosts?skip=0&limit=10
 * @request_headers: Content-Type: application/json
 * 					 Authorization: <token returned by login method>
 */
app.use((ctx,next)=> {
	if (ctx.request.method==='GET' && ctx.request.path==='/listPosts')
		return getToken(ctx).then(()=>{
			return new Promise((resolve, reject) => {
				pageFind.page(ctx,'post',(err, cursor) => {
					resolve(cursor);
				});
			});
		}).then((cursor)=>{
			return new Promise((resolve,reject)=>{
				cursor.toArray((err,docs)=>{
					for (var i in docs){
						docs[i].numberOfComments=(docs[i].comments==undefined?0:docs[i].comments.length);
						delete docs[i].comments;
					}
					resolve(docs);
				});
			});
		},null).then((docs)=>{
			ctx.body={
				posts: docs
			};
			
		},()=>{
		});
	return next();
});

/**
 * Lists all my friends on MY Social Network.
 * e.g.: GET http://localhost:3000/listFriends
 * @request_headers: Content-Type: application/json
 * 					 Authorization: <token returned by login method>
 */
app.use((ctx, next) => {
	  if (ctx.request.method==='GET' && ctx.request.path==='/listFriends'){
		  return getToken(ctx).then(()=>{
			  return new Promise((resolve, reject) => {
				  ctx.mongo.db('mynetwork').collection('user').findOne({"name":loggedInUser.name}, (err, doc) => {
					  var friends=(doc.friends!=undefined && doc.friends.length?doc.friends:[]);
					  ctx.body={
							  friends:friends
					  };
					  resolve();
				  });
			  });
		  }).then(()=>{
			  
		  },()=>{
			  
		  });
	  }
	  return next();
});

/**
 * Lists all users I am following on MY Social Network.
 * e.g.: GET http://localhost:3000/listFollowing
 * @request_headers: Content-Type: application/json
 * 					 Authorization: <token returned by login method>
 */
app.use((ctx, next) => {
	  if (ctx.request.method==='GET' && ctx.request.path==='/listFollowing'){
		  return getToken(ctx).then(()=>{
			  return new Promise((resolve, reject) => {
				  ctx.mongo.db('mynetwork').collection('user').findOne({"name":loggedInUser.name}, (err, doc) => {
					  var following=(doc.following!=undefined && doc.following.length?doc.following:[]);
					  ctx.body={
							  following:following
					  };
					  resolve();
				  });
			  });
		  }, null).then(()=>{
			  
		  },()=>{
			  
		  });
	  }
	  return next();
});

/**
 * Publishes a posts to MY Social Network
 * e.g.: POST http://localhost:3000/post
 * @request_headers: Content-Type: application/json
 * 					 Authorization: <token returned by login method>
 * @payload {"text":<post>}
 * e.g.: {"text":"This is my first post!"}
 */
app.use((ctx, next) => {
	  if (ctx.request.method==='POST' && ctx.request.path==='/post'){
		  return getToken(ctx).then(()=>{
			  return new Promise((resolve, reject) => {
				  var post=ctx.body;
				  post['datePublished']=new Date().getTime();
				  post['publishedBy']=loggedInUser.name;
				  ctx.mongo.db('mynetwork').collection('post').insert(ctx.body, (err, doc) => {
						ctx.body={
							message: 'Post created'
						}
						resolve();
					});
			  });
		  }).then(()=>{
			  
		  },()=>{
			  
		  });
	  }
	  return next();
});

/**
 * Comments post in MY Social Network
 * e.g.: POST http://localhost:3000//commentPost/<mongo id>
 * @request_headers: Content-Type: application/json
 * 					 Authorization: <token returned by login method>
 * @payload {"comment":<text comment>} 
 * e.g {"comment":"Right you are!"}
 */
app.use((ctx, next) => {
	  if (ctx.request.method==='POST' && ctx.request.path.indexOf('/commentPost/')==0){
		    return getToken(ctx)
		    .then(()=>{
			    return new Promise((resolve, reject)=>{
			    	var parts=ctx.request.url.split('/');
			    	var id=parts[parts.length-1];
			    	var comment=ctx.body.comment;
			    	ctx.mongo.db('mynetwork').collection('post').findOne({"_id":getMongoId(id)},(err,doc)=>{
			    		var publishedBy=doc.publishedBy;
			    		if (loggedInUser.friends.filter(function(el){
			    			return el===publishedBy;
			    		}).length){
			    			if (doc.comments==undefined || doc.comments==null)
			    				doc.comments=[];
			    			doc.comments.push(comment);
			    			doc.id=id;
			    			resolve(doc);
			    		} else{
			    			reject();
			    		}
			    	});
			    });
		    },()=>{
		    	
		    }).then((doc)=>{
		    	return new Promise((resolve,reject)=>{
		    		ctx.mongo.db('mynetwork').collection('post').updateOne({"_id":getMongoId(doc.id)},{ $set: { "comments" : doc.comments }},(err,doc)=>{
		    			if (!err){
		    				ctx.body={
		    						message: 'Comment added!'
		    				};
		    				resolve();
		    			}
		    		});
		    	});
		    },()=>{
		    	ctx.response.status=400;
		    	ctx.body={
		    			message: 'Can only comment friends\' posts'
		    	};
		    });
	  }
	  return next();
});

/**
 * Gets MY Social Network post by Id
 * e.g.: GET http://localhost:3000//post/<mongo id>
 * @request_headers: Content-Type: application/json
 * 					 Authorization: <token returned by login method>
 */
app.use((ctx, next) => {
	  if (ctx.request.method==='GET' && ctx.request.path.indexOf('/post/')==0){
		  return getToken(ctx)
		    .then(()=>{
			  return new Promise((resolve,reject)=>{
				  var parts=ctx.request.url.split('/');
			    	var id=parts[parts.length-1];
				  ctx.mongo.db('mynetwork').collection('post').findOne({"_id":getMongoId(id)}, (err,doc)=>{
					  if (!err){
						  ctx.body=doc;
						  resolve();
					  }
					  else{
						  ctx.response.status=400;
						  ctx.body={
								  message:'An error has occurred fetching the post'
						  };
						  reject();
					  }
				  });
			  });
		  },()=>{
			  
		  });
	  }
	  return next();
});

app.listen(3000);