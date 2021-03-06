/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

// [START all]
// [START import]
// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');
const request = require("request");
const cheerio = require("cheerio");
const rp = require("request-promise");
const rp2 = require("request-promise");
var ic = require('iconv-lite')
var BufferHelper = require('bufferhelper')
const phantom = require("phantom");
// The Firebase Admin SDK to access the Firebase Realtime Database. 
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
// [END import]
///////////////////////////////////////////////////////////////////////////////////////////////////////////
exports.ntpu_scrape_info = functions.database.ref('/user_data/{userId}/search/{time}/temp_search_ntpu/{pushId}/link')
    .onCreate(event => {
    
	const searchUrl = event.data.val();
	const uid = event.params.userId;
	const local_time = event.params.time;
	const root = event.data.ref.root;
	event.data.ref.parent.child('searchState').set("Pending!");
	// set request-promise options 
	var options = {
			    uri: searchUrl,
			    headers: {
			        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
					"Accept-Language":"en-US,en;q=0.9",
					"Connection":"keep-alive"
			    },
			    timeout:5000,
			    json: true, // Automatically parses the JSON string in the response
				transform: function(body){
					// use decodeEntities to prevent wrong chinese
					return cheerio.load(body,{decodeEntities: false});
				}
			};
			//start a request promise and parse the html
	const searchrp = rp2(options)
			.then(function($){		
				var jsons = {
								"isbn":"",
								"title":"",
								"author":"",
								"img":"",
								"publish_year":"",
								"publisher":"",
								"link":"",
								"storage":"",
								"location":"",
								"searchState":""
						};

				var title = $(".info").first().find("h2").text().trim();

				var author = $(".info").find("p").html().split("<br>")[0].trim();
				author = author.replace('作者 :','');

				var publisher = $(".info").find("p").html().split("<br>")[1].trim();
				publisher = publisher.replace('出版社 :','');

				var publish_year = $(".info").find("p").html().split("<br>")[2].trim();
				publish_year = publish_year.replace("出版年 : ",'');

				var image = $(".photo").find("img").attr("src");
				if(image == null)
				{
					image = "";
				}

				var links = searchUrl;
				var true_isbn = "";
				var ISBN_tag = false;
				var ISBN = $(".info_box").find("p").html().split("<br>");
				for(var key in ISBN)
				{
					var text = ISBN[key].trim();
					if(!text.search("ISBN") && ISBN_tag==false)
					{
						//deal with some word behind isbn by split the space
						var first_ISBN = text.replace("ISBN ： ","");
						first_ISBN = first_ISBN.split(" ",1);
						true_isbn = first_ISBN[0];
						//console.log(first_ISBN);
						ISBN_tag=true;
						break;
					}
				}
				
				// deal with chinese without space
				
				true_isbn = true_isbn.replace("平裝","");
				true_isbn = true_isbn.replace("精裝","");
				true_isbn = true_isbn.replace("()","");
				true_isbn = true_isbn.replace(":","");

				
				var count=0;
				$("tbody").each(function(){
					var text = $(this).text().trim();
								
					if(text.search("Available")>0){
						count++;
					}
				})
			
				//set the json
				count = count+"";
				jsons = {
								"isbn":true_isbn,
								"title":title,
								"author":author,
								"img":image,
								"publish_year":publish_year,
								"publisher":publisher,
								"link":links,
								"storage":count,
								"location":"ntpu_lib",
								"searchState":"true"
						};
				//push the json to firebase
				admin.database().ref('/user_data/'+uid+'/search/'+local_time+'/search_result').push(jsons);
				
		})
		.catch(function(err){
			event.data.ref.parent.child('searchState').set(err);
			//console.log(err);
		});		
		//return the request-promise to avoid this function being canceled
		return Promise.all([searchrp]).then(()=>{
				return event.data.ref.parent.remove();
			})
			.catch(function(err){
				event.data.ref.parent.child('refresh').set('go');
				console.log("Promise ",searchUrl," wrong!");
			})
      // [END searchkeyBody]
    });
// [END searchkey]
// [END all]
///////////////////////////////////////////////////////////////////////////////////////////////////////////
exports.ntpu_search_url = functions.database.ref('/user_data/{userId}/search/{time}/key')
    .onCreate(event => {

    	const uid = event.params.userId;
    	const local_time = event.params.time;
    	var counter = 0;
    	console.log("uid is "+uid);
    	const root = event.data.ref.root;
    	var havdData = false;
    	event.data.ref.parent.child('ntpu_url').set('false');
    	const key = event.data.val();
    		
    	var options = {
				    uri: 'http://webpac.lib.ntpu.edu.tw/search.cfm?',
				    qs: {
				        m:"ss",
				        k0:key,
				        t0:"k",
				        c0:"and",
				        list_num:"50",
				        current_page:"1",
				    },
				    timeout:5000,
				    headers: {
				        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
						"Accept-Language":"en-US,en;q=0.9",
						"Connection":"keep-alive"
				    },
				    json: true, // Automatically parses the JSON string in the response
					transform: function(body){
						return cheerio.load(body);
					}
				};
 				const searchrp = rp(options)
				.then(function($){
						var title;
						var	author;
					
						var json = {title:"",author:"",link:"",refresh:"false",img:"",searchState:"",location:"",storage:"",publish_year:"",publisher:"",isbn:""};
						$(".list_box").filter(function(){
								havdData = true;
								var data_title = $(this).children().find("li>a").text().trim();
								var data_author = $(this).children().find(".product_info_content>p").first().text().trim();
								var link = $(this).children().find("li>a").attr("href");	
								var image = $(this).find(".product_img>img").attr("src");

								if(data_title!=""){
									var getlink = "http://webpac.lib.ntpu.edu.tw/"+link;
									json.title = data_title;
									json.author = data_author;
									json.link = getlink;
									json.img = image;
									json.location = "ntpu_lib";
									json.searchState = "false";
									admin.database().ref('/user_data/'+uid+'/search/'+local_time+'/temp_search_ntpu').push(json);
									counter++;
								}
						})

				})
				.catch(function(err){
					console.log(err);
				});
			return Promise.all([searchrp]).then(()=>{
					console.log("Scrape "+key+" success");
					//event.data.ref.parent.child('key').remove();
					return event.data.ref.parent.child('ntpu_url').set(counter.toString());
			})
			.catch(reason => {
				admin.database().ref('/user_data/'+uid+'/search/'+local_time+'/isFinish').push(reason);
			});
    	
    });
//////////////////////////////////////////////////////////////////////////////////////////////////////////
exports.tc_search_url = functions.database.ref('/user_data/{userId}/search/{time}/key')
    .onCreate(event => {

    	const uid = event.params.userId;
    	const local_time = event.params.time;
    	var counter = 0;
    	console.log("uid is "+uid);
    	const root = event.data.ref.root;
    	var instance, _page;
    	event.data.ref.parent.child('tc_url').set('false');
    	const key = event.data.val();
    	
    	const searchrp = 
    	phantom
        .create( [ '--ignore-ssl-errors=yes' ])
        .then(ph=>{
            instance = ph;
            return instance.createPage();
        })
        .then(page=>{
            _page = page;
            _page.setting( 'resourceTimeout', 5000 ); // resource timeout
            _page.setting('userAgent', "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36")
            _page.on('onConsoleMessage', true, function(msg) {
                console.log(msg);
            })
            return _page.open('http://book.tpml.edu.tw/webpac/booksearch.do?search_field=FullText&search_input='+key+"&Submit=%E6%9F%A5%E8%A9%A2&resid=188940342&nowpage=1");
        })
        .then(status=>{
            console.log(status);
            return new Promise(resolve => setTimeout(resolve, 2000))
            .then(()=>{
                console.log("wait 2 sec..");
            })
        })
        .then(()=>{
            console.log("start fetch content")
            return _page.property('content');
        })
        .then( body =>{
        	var json = {title:"",author:"",link:"",refresh:"false",img:"",searchState:"false",location:"tc_lib",storage:"",publish_year:"",publisher:"",isbn:""};
            let $ = cheerio.load(body,{decodeEntities:false});
            // console.log($(".tablesorter").text());
           
            $("td > h4 > a").filter(function(index) {

                var title_author = $(this).text();
                var href = $(this).attr("href");
               
                if(title_author.search(" /")>=0){
                    json.title = title_author.split(" /")[0];
                    json.author = title_author.split(" /")[1];
                }
                else if(title_author.search("/ ")>=0){
                    json.title = title_author.split("/ ")[0];
                    json.author = title_author.split("/ ")[1];
                }
               else if(title_author.search(" / ")>=0){
                    json.title = title_author.split(" / ")[0];
                    json.author = title_author.split(" / ")[1];
                }
                counter++;
                json.link = "http://book.tpml.edu.tw/webpac/"+href;
                admin.database().ref('/user_data/'+uid+'/search/'+local_time+'/temp_search_tc').push(json);
                
            });
        })
        .catch(reason =>{
        	console.log(reason)
        	return event.data.ref.parent.child('tc_url').set("0");
        })


		return Promise.all([searchrp]).then(()=>{
				console.log("Scrape "+key+" success");
					//event.data.ref.parent.child('key').remove();
				return event.data.ref.parent.child('tc_url').set(counter.toString());
		})
		.catch(reason => {
			
		});
    	
    });

//////////////////////////////////////////////////////////////////////////////////////////////////////////

exports.ntpu_refresh = functions.database.ref('/user_data/{userId}/search/{time}/temp_search_ntpu/{pushId}/refresh')
	.onUpdate(event => {
			const uid = event.params.userId;
			const local_time = event.params.time;
			return event.data.ref.parent.child('link').once('value')
			.then(function(snapshot) {
				return snapshot.val();
			})
			.then(function(searchUrl){
				var options = {
						    uri: searchUrl,
						    timeout:5000,
						    headers: {
						        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
								"Accept-Language":"en-US,en;q=0.9",
								"Connection":"keep-alive"
						    },
						    json: true, // Automatically parses the JSON string in the response
							transform: function(body){
								return cheerio.load(body,{decodeEntities: false});
							}
						};
			const refresh_search = rp(options)
				.then(function($){	

				var jsons = {
								"isbn":"",
								"title":"",
								"author":"",
								"img":"",
								"publish_year":"",
								"publisher":"",
								"link":"",
								"location":"",
								"storage":"",
								"searchState":""
						};


				var title = $(".info").first().find("h2").text().trim();

				var author = $(".info").find("p").html().split("<br>")[0].trim();
				author = author.replace('作者 :','');

				var publisher = $(".info").find("p").html().split("<br>")[1].trim();
				publisher = publisher.replace('出版社 :','');

				var publish_year = $(".info").find("p").html().split("<br>")[2].trim();
				publish_year = publish_year.replace("出版年 : ",'');

				var image = $(".photo").find("img").attr("src");

				var links = searchUrl;

				var true_isbn = "";
				var ISBN_tag = false;
				var ISBN = $(".info_box").find("p").html().split("<br>");
				for(var key in ISBN)
				{
					var text = ISBN[key].trim();
					if(!text.search("ISBN") && ISBN_tag==false)
					{
						//deal with some word behind isbn by split the space
						var first_ISBN = text.replace("ISBN ： ","");
						first_ISBN = first_ISBN.split(" ",1);
						true_isbn = first_ISBN[0];
						//console.log(first_ISBN);
						ISBN_tag=true;
						break;
					}
				}

				// deal with chinese without space
				true_isbn = true_isbn.replace("平裝","");
				true_isbn = true_isbn.replace("精裝","");
				true_isbn = true_isbn.replace("()","");
				true_isbn = true_isbn.replace(":","");

				var count=0;
				$("tbody").each(function(){
					var text = $(this).text().trim();
								
					if(text.search("Available")>0){
						count++;
					}
				})
				count= count+"";
				jsons = {
								"isbn":true_isbn,
								"title":title,
								"author":author,
								"img":image,
								"publish_year":publish_year,
								"publisher":publisher,
								"link":links,
								"location":"ntpu_lib",
								"storage":count,
								"searchState":"true"
						};
				
				admin.database().ref('/user_data/'+uid+'/search/'+local_time+'/search_result').push(jsons);
				return event.data.ref.parent.remove();
			})
			.catch(function(err){
				console.log(err);
				//console.log("too late!");
			});
			return Promise.all([refresh_search]).then(()=>{
					console.log("refresh finish");
			})
			.catch(reason=>{
				return event.data.ref.parent.child('searchState').set(err);
			})
		})
	});

exports.tc_search_info = functions.database.ref('/user_data/{userId}/search/{time}/temp_search_tc/{pushId}/link')
    .onCreate(event => {

    const searchUrl = event.data.val();
	const uid = event.params.userId;
	const local_time = event.params.time;
	var instance,_page;
	event.data.ref.parent.child('searchState').set("Pending!");
	var url = searchUrl;
    const pr =
    phantom
        .create()
        .then(ph=>{
            instance = ph;
            return instance.createPage();
        })
        .then(page=>{
            _page = page;
            return _page.open(url);
        })
        .then(status=>{
            console.log(status);
            return new Promise(resolve => setTimeout(resolve, 2000))
        })
        .then(()=>{
            return _page.property('content');
        })
        .then(content=>{
            //_page.render("look.png");
            //fs.writeFile('message.txt',content);
            var $ = cheerio.load(content);
            var find_ISBN;
            find_ISBN = 0; // 0 == false  ; 1 == true
            var jsons = {
                                "isbn":"",
                                "title":"",
                                "author":"",
                                "img":"",
                                "publish_year":"",
                                "publisher":"",
                                "link":url,
                                "location":"tc_lib",
                                "storage":"",
                                "searchState":"true"
                        };
            var title = $(".mainconC > h3").text().trim();
            jsons.title = title;

            $('#detailViewDetailContent > table > tbody').filter(function(){
                var tag = $(this).find("td").eq(0).text();
                var value = $(this).find("td").eq(1).text();
                if(tag.search("出版項")>=0)
                    jsons.publisher = value;
                    //console.log(value);
            })


            $('#detailViewDetailContent').filter(function(){
                var num = $('#detailViewDetailContent').children().length
                for (var i = 0; i < num; i++) {
                    var data = $(this).children().eq(i).children().children().children().first().text();
                    if(data=="ISBN：" && find_ISBN == 0){
                        var ISBN = $(this).children().eq(i).children().children().children().last().text();
                        var m = (ISBN.indexOf("("));
                        ISBN = ISBN.slice(0,m);
                        jsons.isbn = ISBN;
                        //console.log(ISBN);
                        find_ISBN = 1;
                    }
                    if(data=="著者："){
                        var author = $(this).children().eq(i).children().children().children().last().text();
                        jsons.author = author;
                        //console.log(author);
                    }
                   
                }                
            }) 
            
            //----------書圖片網址------------------------
            var img = $('.myImages').children().attr('src');
            jsons.img = img;
            //console.log(img);
            //-------------館藏量-------------------------
            var storage = $('#integratehold').text().trim();
            var index = (storage.indexOf("件館藏"));
            if(index == -1){
                //console.log("目前沒有館藏");
                jsons.storage = "0";
                storage = 0;
            }
            else{
                storage = storage.slice(0,index);
                jsons.storage = storage;
                //console.log(storage);
            }
            admin.database().ref('/user_data/'+uid+'/search/'+local_time+'/search_result').push(jsons);
            //----------------------------------------------
        })
        .catch(err=>{
            console.log(err);
        })

    return Promise.all([pr])
			.then(()=>{
				return event.data.ref.parent.remove();
			})
	
})
///////////////////////////////////////////////////////////////////////////////////////////////////////////
exports.Xinpei_search_url = functions.database.ref('/user_data/{userId}/search/{time}/key')
    .onCreate(event => {

    	event.data.ref.parent.child('error_xinpei').remove();
    	const uid = event.params.userId;
    	const local_time = event.params.time;
    	console.log("(sinpei)uid is "+uid);
    	const root = event.data.ref.root;
    	var counter = 0;
    	const key = event.data.val();
    	event.data.ref.parent.child('Xinpei_url').set("false");
    	var options = {
			    uri: 'http://webpac.tphcc.gov.tw/toread/opac/search?',
			    timeout:5000,
			    qs: {
			        q:key,
			        max:"2",  //2->50 books
			        view:"CONTENT",
			        location:"0",
			    },
			    headers: {
			        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
					"Accept-Language":"en-US,en;q=0.9",
					"Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
					"Connection":"keep-alive"
			    },
			    json: true, // Automatically parses the JSON string in the response
				transform: function(body){
					return cheerio.load(body,{decodeEntities: false});
					}
				};
 				const searchrp = rp(options)
				.then(function($){
					var json = {title:"",author:"",location:"",link:"",img:"",searchState:"",storage:"",isbn:"",publish_year:"",publisher:""};
					var cn = -1;
					var cnn="";
					$(".is_img").filter(function(){
						
						var data_title = $(this).find(".reslt_item_head").text().trim();
						var data_author = $(this).find(".crs_author").text().trim();
						var links = $(this).find(".reslt_item_head>a").attr("href");
						if(cn >= 0) cnn="_"+cn;
						cn++;
						var image = $(this).find("img").attr("src");
						var data_count = $(this).find("#MyPageLink_4"+cnn).text().trim();

						if(image == '/toread/images/macheteicons/book.gif')
						{
							image = "http://webpac.tphcc.gov.tw/toread/images/macheteicons/book.gif";
						}

						data_count = data_count.replace(" 本館藏 可借閱", "");
						data_title = data_title.replace("/","");
						json.title = data_title;
						json.author = data_author;
						json.location = "ntc_lib";
						json.link = "http://webpac.tphcc.gov.tw"+links;
						json.storage = data_count;
						json.img = image;
						json.searchState = "false";

						event.data.ref.parent.child('temp_result_Xinpei').push(json);
						counter++;
					})
					

				})
				.catch(function(err){
					console.log(err);
				});
			return Promise.all([searchrp]).then(()=>{
					console.log("(inpei)Scrape "+key+" success");
					return event.data.ref.parent.child('Xinpei_url').set(counter.toString());
			})
			.catch(reason => {
				admin.database().ref('/user_data/'+uid+'/search/'+local_time+'/isFinish').push(reason);
			})
    	
    });
///////////////////////////////////////////////////////////////////////////////////////////////////////////
exports.Xinpei_search_info = functions.database.ref('/user_data/{userId}/search/{time}/temp_result_Xinpei/{pushId}/link')
    .onCreate(event => {
    const searchUrl = event.data.val();
	const uid = event.params.userId;
	const local_time = event.params.time;
	var havdData = false;
	const pr1 = event.data.ref.parent.child('storage').once('value');
	const root = event.data.ref.root;
	event.data.ref.parent.child('searchState').set("Pending!");
	return Promise.all([pr1]).then( results => {

		const count_book = results[0].val();
		var options = {
			    uri: searchUrl,
			    timeout:5000,
			    headers: {
			        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
					"Accept-Language":"en-US,en;q=0.9",
					"Connection":"keep-alive"
			    },
			    json: true, // Automatically parses the JSON string in the response
				transform: function(body){
					// use decodeEntities to prevent wrong chinese
					return cheerio.load(body,{decodeEntities: false});
				}
			};
		const searchrp = rp(options).then(function($){
			var title, author, isbn, year, publisher, img;
			var json = {title:"",author:"",location:"",link:"",img:"",searchState:"",storage:"",isbn:"",publish_year:"",publisher:""};
			
			$(".reslt_item_head").filter(function(){       //title
				havdData = true;
				var data_title = $(this).text().trim();
				data_title = data_title.replace("/","");
				json.title = data_title;
			})
			$(".img_reslt").filter(function(){       //image
				havdData = true;
				var data_img = $(this).find("#Any_10").attr("src");
				if(data_img == null)
				{
					data_img = "";
				}
				json.img = data_img;
			})

			$(".bibViewTable").filter(function(){        //author, isbn, year, publisher
				havdData = true;
				var data_author="", data_isbn="", data_year="", data_publisher="";
				for(var i = 0 ; i<20;i++){
					var str="#For_"+i+">th";
					var ss =$(this).find(str).text().trim();
						if(ss.search("作者:")>=0) 	
							data_author = $(this).find("#For_"+i+">td").text().trim();
						else if(ss == "ISBN:")
							data_isbn = $(this).find("#For_"+i+">td").text().trim();
						else if(ss == "出版年:")
							data_year = $(this).find("#For_"+i+">td").text().trim();
						else if(ss == "出版者:")
							data_publisher = $(this).find("#For_"+i+">td").text().trim();
				}
				if(data_year=="")
				{
					if(data_publisher.search(",")>=0){
						data_publisher = data_publisher.split(",",2);
						data_year = data_publisher[1];
						data_publisher = data_publisher[0];
					}
					else if(data_publisher.search(";")>=0)
					{
						data_publisher = data_publisher.split(";",2);
						data_year = data_publisher[1];
						data_publisher = data_publisher[0];
					}
				}
				
				data_publisher = data_publisher.replace(";",'');
				data_isbn = data_isbn.replace("平裝", "");
				data_isbn = data_isbn.replace("精裝", "");
				data_isbn = data_isbn.replace("()", "");
				data_isbn = data_isbn.replace(":", "");

				json.author = data_author;
				json.isbn = data_isbn;
				json.publish_year = data_year;
				json.publisher = data_publisher;
				json.link = searchUrl;
				json.searchState = "true";
				json.storage = count_book;
				json.location = "ntc_lib";
				admin.database().ref('/user_data/'+uid+'/search/'+local_time+'/search_result').push(json);
				
			})
			if(!havdData)
			{
				admin.database().ref('/user_data/'+uid+'/search/'+local_time).update({error_xinpei:"URL_no_resp"});
			}
		})
		.catch(reason => {
			event.data.ref.parent.child('searchState').set(reason);
		});
		
		return Promise.all([searchrp]);
			
	})
	.then(()=>{
		return event.data.ref.parent.remove();
	})
	
})

///////////////////////////////////////////////////////////////////////////////////////////////////////////
exports.hot_key_info = functions.database.ref('/hot_key/trigger')
	.onDelete(event => {
	
	event.data.ref.parent.child('result').remove();
	event.data.ref.parent.child('isFinish').set('false');
	event.data.ref.parent.child('trigger').set('searching');
	var options = {
			    uri: 'http://book.tpml.edu.tw/webpac/webpacIndex.jsp',
			    timeout:5000,
			    headers: {
			        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
					"Accept-Language":"en-US,en;q=0.9",
					"Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
					"Connection":"keep-alive"
			    },
			    json: true, // Automatically parses the JSON string in the response
				transform: function(body){
					return cheerio.load(body);
				}
			};
	const pr = 	rp(options)
			.then(function($){
					var title;
					var json = {};
					 $('.tagCloud > ul > li').each(function () {
		            	var key = $(this).text().trim()
		            	var json = {[key]:key};
		            	event.data.ref.parent.child('result').update(json);
		            	//console.log(json);
		          });
				
			})
			.then(()=>{
				event.data.ref.parent.child('isFinish').set("true");
			})
			.catch(function(err){
				console.log(err);
			});

		return Promise.all([pr]).then(()=>{
			event.data.ref.parent.child('trigger').set('deleteMe');
			console.log("finish");
		})
	});
///////////////////////////////////////////////////////////////////////////////////////////////////////////
exports.new_book_url = functions.database.ref('/new_book/trigger')
	.onDelete(event => {

	event.data.ref.parent.child('search_result').remove();
	
	event.data.ref.parent.child('trigger').set('searching');

	var url = "http://webpac.lib.ntpu.edu.tw/newbook_focus.cfm";
	var options = {
		    uri: url,
		    timeout:5000,
		    headers: {
		        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
				"Accept-Language":"en-US,en;q=0.9",
				"Connection":"keep-alive"
		    },
		    json: true, // Automatically parses the JSON string in the response
			transform: function(body){
				// use decodeEntities to prevent wrong chinese
				return cheerio.load(body,{decodeEntities: false});
			}
		};
	const newrp = rp(options).then(function($){
		var json = {};
		$(".bookDetail").each(function(){
			var data_title = $(this).find(".title").text().trim();
			var data_author = $(this).find(".author").text().trim();
			var links = $(this).find(".title>a").attr("href");
			var img = "http://webpac.lib.ntpu.edu.tw/"+ $(this).find("img").attr("src");
			if(data_title!=""){
				json.link = "http://webpac.lib.ntpu.edu.tw/"+links;
				json.image = img;
				json.title = data_title;
				json.author = data_author;
				json.location = "ntpu_lib";
				event.data.ref.parent.child('temp_result').push(json);
			}
		})

	})
	.catch(reason => {
		console.log(reason);
	});
	
	return Promise.all([newrp]).then(()=>{
		event.data.ref.parent.child('searchState').set('info_search');	
	})
})
///////////////////////////////////////////////////////////////////////////
exports.new_book_info = functions.database.ref('/new_book/temp_result/{pushId}/link')
	.onCreate(event => {

	admin.database().ref('/new_book/searchState').set('search_info');

	var url = event.data.val();
	var options = {
		    uri: url,
		    timeout:5000,
		    headers: {
		        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
				"Accept-Language":"en-US,en;q=0.9",
				"Connection":"keep-alive"
		    },
		    json: true, // Automatically parses the JSON string in the response
			transform: function(body){
				// use decodeEntities to prevent wrong chinese
				return cheerio.load(body,{decodeEntities: false});
			}
		};
		const newrp = rp(options).then(function($){

		var title = $(".info").first().find("h2").text().trim();

		var author = $(".info").find("p").html().split("<br>")[0].trim();
		author = author.replace('作者 :','');

		var publisher = $(".info").find("p").html().split("<br>")[1].trim();
		publisher = publisher.replace('出版社 :','');

		var publish_year = $(".info").find("p").html().split("<br>")[2].trim();
		publish_year = publish_year.replace("出版年 : ",'');

		var image = "http://webpac.lib.ntpu.edu.tw/" + $(".photo").find("img").attr("src");

		var links = url;

		var ISBN_tag = false;
		var ISBN = $(".info_box").find("p").html().split("<br>");
		for(var key in ISBN)
		{
			var text = ISBN[key].trim();
			if(!text.search("ISBN") && ISBN_tag==false)
			{
				//deal with some word behind isbn by split the space
				var first_ISBN = text.replace("ISBN ： ","");
				first_ISBN = first_ISBN.split(" ",1);
				//console.log(first_ISBN);
				ISBN_tag=true;
				break;
			}
		}
			var true_isbn = first_ISBN[0];
			// deal with chinese without space
			if(true_isbn.search("平裝"))
				true_isbn = true_isbn.replace("平裝","");

			var count=0;
			$("tbody").each(function(){
				var text = $(this).text().trim();
							
				if(text.search("Available")>0){
					count++;
				}
			})
				
			count = count+"";
			var jsons = {
					"isbn":true_isbn,
					"title":title,
					"author":author,
					"img":image,
					"publish_year":publish_year,
					"publisher":publisher,
					"link":links,
					"storage":count,
					"location":"ntpu_lib",
					"searchState":"true"
					};
			admin.database().ref('/new_book/search_result').push(jsons);
	})
	.catch(reason => {
		console.log(reason);
	});
	
	return Promise.all([newrp]).then(()=>{
		event.data.ref.parent.remove();
		admin.database().ref('/new_book/searchState').set('Finish');
		admin.database().ref('/new_book/trigger').set('DeleteMe_to_search');
	})
})

exports.ntc_sign = functions.database.ref('/user_data/{userId}/library_account/ntc_lib/key')

.onCreate(event =>{

    

	event.data.ref.parent.child('State').set('initialize')

	const uid = event.params.userId;

	const pr1 = event.data.ref.parent.child('account').once('value');

	const pr2 = event.data.ref.parent.child('password').once('value');

	console.log("start fetching username and password from "+uid+"....")

	var instance, _page;

	return Promise.all([pr1,pr2]).then(results =>{

		event.data.ref.parent.child('State').set('pending')

		console.log("fething success!")

		const username = results[0].val()

		const password = results[1].val()

		console.log("user is "+username);

		const pr = 

		  phantom

		  .create()

		  .then(ph => {

		    instance = ph

		    return instance.createPage()

		  })

		  .then(page => {

		  	console.log("create page success")

		    _page = page

		    _page.setting('userAgent', "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36")

		    _page.on('onConsoleMessage', true, function(msg) {

		        console.log('msg: ' + msg)

		    })

		    return _page.open('http://www.library.ntpc.gov.tw/loginControl/')

		  })

		  .then(status => {

        	return new Promise(function (resolve, reject) {
          var condition = 0  // 0: timeout  1: success 2: fail
            _page.on('onUrlChanged', function (url) {
                if (url == 'http://www.library.ntpc.gov.tw/') {
                    condition = 1
                    resolve()
                }
            })

            _page.evaluate(function (name, pass) {
                document.querySelector("input[id='loginUsername']").value = name
                document.querySelector("input[id='loginPassword']").value = pass
                document.querySelector("input[name='codenumber']").value = document.querySelector("input[id='codeVal']").value
                document.querySelector("input[type='submit']").onclick();
                console.log("Login submitted!")
            }, username, password)
            .then(() => {
                var start = new Date().getTime(),
                    interval = setInterval(function () {
                    //  20s 超時
                    if ((new Date().getTime() - start < 20000) && condition == 0) {
                        console.log((new Date().getTime() - start))
                        _page.property('content')
                            .then((body) => {
                                var $ = cheerio.load(body)
                                if ($('td > #messSpan').text() != null) {
                                    condition = 2
                                }
                            })
                    } else {
                        if (condition == 0) {
                            reject("timeout");
                            clearInterval(interval); //< Stop this interval
                        } else if (condition == 1) {
                            console.log("finished in " + (new Date().getTime() - start) + "ms.");
                            clearInterval(interval); //< Stop this interval
                        } else {
                            reject("Incorrect passward!!")
                            clearInterval(interval); //< Stop this interval
                        }
                    }
                }, 500); //< repeat check every 500ms
            })
        })

      })

      .then((p)=> {

        console.log(username+": log success!")

        const off = _page.off('onUrlChanged');

        return Promise.all([off])

      })

      .then(()=> {

        event.data.ref.parent.child('State').set('Finish')

        instance.exit()

      })

      .catch(e => {

        console.log(username+"login Failed! " + e)

        const off = _page.off('onUrlChanged');

        return Promise.all([off]).then(()=>{

          event.data.ref.parent.child('State').set('Error')

          instance.exit()

        })

      });



      return Promise.all([pr]).then(()=>{

        return event.data.ref.parent.child('key').remove()

      })

    })

})

exports.tc_sign = functions.database.ref('/user_data/{userId}/library_account/tc_lib/key')

.onCreate(event =>{

	

	event.data.ref.parent.child('State').set('initialize')

	const uid = event.params.userId

	const pr1 = event.data.ref.parent.child('account').once('value')

	const pr2 = event.data.ref.parent.child('password').once('value')

	console.log("start fetching username and password from "+uid+"....")

	var instance, _page

	return Promise.all([pr1,pr2]).then(results =>{

		event.data.ref.parent.child('State').set('pending')

		console.log("fething success!")

		const username = results[0].val()

		const password = results[1].val()

		console.log("user is "+username)

		const pr = 

		  phantom

		  .create()

		  .then(ph => {

		    instance = ph

		    return instance.createPage()

		  })

		  .then(page => {

		  	console.log("create page success")

		    _page = page

		    _page.setting('userAgent', "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36")

		    _page.on('onConsoleMessage', true, function(msg) {

		        console.log('msg: ' + msg)

		    })

		    return _page.open('http://book.tpml.edu.tw/webpac/webpacIndex.jsp')

		  })

		  .then(status => {

		    return new Promise(function (resolve, reject) {

		      _page.on('onAlert', function (msg) {

		        reject(msg)

		      })

		      _page.on('onLoadFinished', function (status) {

		        resolve(status)

		      })

		      console.log("prepare to submit")

		      _page.evaluate(function (name,pass) {

            

            document.querySelector("form[name='memberlogin']").autocomplete = "on"

            document.querySelector("input[name='account2']").value = name

            document.querySelector("input[name='passwd2']").value = pass

            document.querySelector("form[name='memberlogin']").submit()

					

			      },username,password)

			    })

			  })

			  .then((p)=> {

			    console.log(username+": log success!")

			    const off = _page.off('onLoadFinished')

			    return Promise.all([off])

			  })

			  .then(()=> {

			  	event.data.ref.parent.child('State').set('Finish')

			    instance.exit()

			  })

			  .catch(e => {

			    console.log(username+"login Failed! " + e)

			    const off = _page.off('onLoadFinished')

			    return Promise.all([off]).then(()=>{

						event.data.ref.parent.child('State').set('Error')

			      instance.exit()

			    })

			  })

			 

		return Promise.all([pr]).then(()=>{

			return event.data.ref.parent.child('key').remove()

		})

	})

})

exports.ntpu_sign = functions.database.ref('/user_data/{userId}/library_account/ntpu_lib/key')
.onCreate(event =>{

	event.data.ref.parent.child('State').set('initialize');
	const uid = event.params.userId;
	const pr1 = event.data.ref.parent.child('account').once('value');
	const pr2 = event.data.ref.parent.child('password').once('value');
	console.log("start fetching username and password from "+uid+"....")
	var instance, _page;
	return Promise.all([pr1,pr2]).then(results =>{
		event.data.ref.parent.child('State').set('pending');
		console.log("fething success!")
		const username = results[0].val()
		const password = results[1].val()
		console.log("user is "+username);
		const pr = 
		  phantom
		  .create()
		  .then(ph => {
		    instance = ph
		    return instance.createPage()
		  })
		  .then(page => {
		  	console.log("create page success")
		    _page = page
		    _page.setting('userAgent', "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36")
		    _page.on('onConsoleMessage', true, function(msg) {
		        console.log('msg: ' + msg)
		    })
		    return _page.open('http://webpac.library.ntpu.edu.tw/Webpac2/Person.dll/')
		  })
		  .then(status => {
		    return new Promise(function (resolve, reject) {
		      _page.on('onAlert', function (msg) {
		        reject(msg)
		      })
		      _page.on('onLoadFinished', function (status) {
		        resolve(status)
		      })
		      console.log("prepare to submit");
		      _page.evaluate(function (name,pass) {
		      		
		        	document.querySelector("input[name='RNO']").value = name;
		        	document.querySelector("input[name='PWD']").value = pass;
		        	document.querySelector("form[name='CODE']").submit();
					
			      },username,password);
			    })
			  })
			  .then((p)=> {
			    console.log(username+": log success!")
			    const off = _page.off('onLoadFinished');
			    return Promise.all([off])
			  })
			  .then(()=> {
			  	event.data.ref.parent.child('State').set('Finish');
			  	event.data.ref.parent.child('search_key').set('go');
			    instance.exit()
			  })
			  .catch(e => {
			  	//event.data.ref.parent.child('State').set('Error');
			    console.log(username+"login Failed! " + e)
			    const off = _page.off('onLoadFinished');
			    return Promise.all([off]).then(()=>{
			      event.data.ref.parent.child('State').set('Error');
			      instance.exit()
			      
			    })
			  });
			 
			return Promise.all([pr]).then(()=>{

				  	return event.data.ref.parent.child('key').remove();
				  })
	})

})
exports.ntpu_list = functions.database.ref('/user_data/{userId}/borrow_book/trigger')
.onCreate(event =>{
    
	event.data.ref.parent.child('ntpu_State').set('initialize')
	const uid = event.params.userId;
	const pr1 = admin.database().ref('/user_data/'+uid+'/library_account/ntpu_lib/account').once('value');
	const pr2 = admin.database().ref('/user_data/'+uid+'/library_account/ntpu_lib/password').once('value');
	console.log("start fetching username and password from "+uid+"....")
	var countt = 0;
	var instance, _page, _url_borrow, _url_hist
	return Promise.all([pr1,pr2]).then(results =>{
		event.data.ref.parent.child('ntpu_State').set('pending')
		console.log("fetching success!")
		const username = results[0].val()
		const password = results[1].val()
		console.log("user is "+username);
		const pr = 
		  phantom
		  .create()
		  .then(ph => {
		    instance = ph
		    return instance.createPage()
		  })
		  .then(page => {
		  	console.log("create page success")
		    _page = page
		    _page.setting('userAgent', "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36")
		    _page.on('onConsoleMessage', true, function(msg) {
		        console.log('msg: ' + msg)
		    })
		    return _page.open('http://webpac.library.ntpu.edu.tw/Webpac2/Person.dll/')
		  })
		  .then(status => {
        return new Promise(function (resolve, reject) {
          _page.on('onAlert', function (msg) {
            reject(msg)
          })
          _page.on('onLoadFinished', function (status) {
            resolve(status)
          })

          _page.evaluate(function (name,pass) {

            document.querySelector("input[name='RNO']").value = name;
            document.querySelector("input[name='PWD']").value = pass;
            document.querySelector("form[name='CODE']").submit();
            return new Promise(resolve => setTimeout(resolve, 5000))

          },username,password)
        })
      })
      .then((status)=> {
        _page.sendEvent('keydown', 16777217, null, null)
        _page.sendEvent('keydown', 16777217, null, null)
        _page.sendEvent('keydown', 16777217, null, null)
        _page.sendEvent('keydown', 16777217, null, null)
        _page.sendEvent('keydown', 16777221, null, null)
        return Promise.all([
          _page.off('onAlert'),
          new Promise(function (resolve) {
            _page.on('onResourceReceived', function(response) {
              if (response.stage == 'end') {
                var sss = JSON.parse(JSON.stringify(response))
                _url_borrow = sss["url"]
                resolve()
              }
            })
          })
        ])
      })
      .then((p)=> {
        _page.sendEvent('keydown', 16777217, null, null)
        _page.sendEvent('keydown', 16777221, null, null)
        return Promise.all([
          _page.off('onResourceReceived'),
          new Promise(function (resolve) {
            _page.on('onResourceReceived', function(response) {
              if (response.stage == 'end') {
                var sss = JSON.parse(JSON.stringify(response))
                _url_hist = sss["url"]
                resolve()
              }
            })
          })
        ])
      })
      .then((p)=>{
        return Promise.all([
          _page.off('onResourceReceived'),
          _page.open(_url_borrow)
        ])
      })
      .then((p)=>{
        return new Promise(resolve => setTimeout(resolve, 3000))
      })
      .then((p)=>{
        return _page.property('content')
      })
      .then((content)=>{
        console.log('loading list')
        var $ = cheerio.load(content)
    
        var data = $('table:nth-child(3) > tbody > tr > td')
        for (var i = 9; i < data.length; i+=9) {
        	countt++;
          var author = $(data[i + 4]).text().trim()
          var location = "臺北大學圖書館 " + $(data[i + 2]).text().trim()
          var renew_count = $(data[i + 6]).text().trim()
          var title = $(data[i + 3]).text().trim()
    
          var json = {
              "author": author,
              "location": location,
              "renew_count": renew_count,
              "title": title,
          }
          /////////////////////////////////////////////////////
          admin.database().ref('/user_data/'+uid+'/borrow_book/list').update({[countt]:json});
          /////////////////////////////////////////////////////
        }
        return new Promise(resolve => setTimeout(resolve, 3000))
      })
      .then((p)=>{
        return _page.open(_url_hist)
      })
      .then((p)=>{
        return new Promise(resolve => setTimeout(resolve, 3000))
      })
      .then((p)=>{
        return _page.property('content')
      })
      .then((content)=>{
        console.log('loading history')
        var $ = cheerio.load(content)
    
        var data = $('table:nth-child(2) > tbody > tr > td')
        for (var i = 11; i < data.length; i+=8) {
        	countt++;
          var author = $(data[i + 5]).text().trim()
          var borrow_time = $(data[i + 1]).text().trim()
          var location = "臺北大學圖書館 " + $(data[i + 3]).text().trim()
          var title = $(data[i + 4]).text().trim()
          var search_book_number = $(data[i + 7]).text().trim()
    
          var json = {
              "author": author,
              "borrow_time": borrow_time,
              "location": location,
              "title": title,
              "search_book_number": search_book_number
          }
          /////////////////////////////////////////////////////
          admin.database().ref('/user_data/'+uid+'/borrow_book/list').update({[countt]:json});
          /////////////////////////////////////////////////////
        }
        return new Promise(resolve => setTimeout(resolve, 3000))
      })
      .then((p)=> {
        const off = _page.off('onLoadFinished');
        return Promise.all([off])
      })
      .then(()=> {
        event.data.ref.parent.child('ntpu_State').set('Finish')
        instance.exit()
      })
      .catch(e => {
        console.log(username+"login Failed! " + e)
        const off = _page.off('onLoadFinished');
        return Promise.all([off]).then(()=>{
          event.data.ref.parent.child('ntpu_State').set('Error')
          instance.exit()
        })
      });

      return Promise.all([pr]).then(()=>{
        return event.data.ref.parent.child('trigger').remove()
      })
    })
})

exports.ntc_list = functions.database.ref('/user_data/{userId}/borrow_book/trigger')
.onCreate(event =>{
    
	event.data.ref.parent.child('ntc_State').set('initialize')
	const uid = event.params.userId;
	const pr1 = admin.database().ref('/user_data/'+uid+'/library_account/ntc_lib/account').once('value');
    const pr2 = admin.database().ref('/user_data/'+uid+'/library_account/ntc_lib/password').once('value');
    var countt = 40;
	console.log("start fetching username and password from "+uid+"....")
	var instance, _page;
	return Promise.all([pr1,pr2]).then(results =>{
		event.data.ref.parent.child('ntc_State').set('pending')
		console.log("fetching success!")
		const username = results[0].val()
		const password = results[1].val()
		console.log("user is "+username);
		const pr = 
		  phantom
		  .create()
		  .then(ph => {
		    instance = ph
		    return instance.createPage()
		  })
		  .then(page => {
		  	console.log("create page success")
		    _page = page
		    _page.setting('userAgent', "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36")
		    _page.on('onConsoleMessage', true, function(msg) {
		        console.log('msg: ' + msg)
		    })
		    return _page.open('http://www.library.ntpc.gov.tw/loginControl/')
		  })
		  .then(status => {
        	return new Promise(function (resolve, reject) {
          var condition = 0  // 0: timeout  1: success 2: fail
          _page.on('onLoadFinished', function (url) {
            condition = 1
            resolve()
          })

          _page.evaluate(function (name,pass) {

            document.querySelector("input[id='loginUsername']").value = name
            document.querySelector("input[id='loginPassword']").value = pass
            document.querySelector("input[name='codenumber']").value = document.querySelector("input[id='codeVal']").value
            document.querySelector("input[type='submit']").onclick()
            return new Promise(resolve => setTimeout(resolve, 10000))

          },username,password)
          .then(() => {
              var start = new Date().getTime(),
                  interval = setInterval(function () {
                  //  20s �W��
                  if ((new Date().getTime() - start < 20000) && condition == 0) {
                      console.log((new Date().getTime() - start))
                      _page.property('content')
                          .then((body) => {
                              var $ = cheerio.load(body)
                              if ($('td > #messSpan').length === 1 && $('td > #messSpan').text()){
                                clearInterval(interval);
                                reject($('td > #messSpan').text())
                              }
                          })
                  } else {
                      if (condition == 0) {
                          reject("timeout");
                          clearInterval(interval); //< Stop this interval
                      } else if (condition == 1) {
                          console.log("finished in " + (new Date().getTime() - start) + "ms.");
                          clearInterval(interval); //< Stop this interval
                      }
                  }
              }, 500); //< repeat check every 500ms
          })
        })
      })
      .then((p)=> {
        console.log(username+": log success!")
        return _page.property('content')
      })
      .then((content)=> {
        var $ = cheerio.load(content)
        var url = $(".remove-text-nodes:nth-child(1) > li:nth-child(3) > a").attr('href')
        console.log(url)
        return _page.open(url)
      })
      .then((p)=> {
        return new Promise(resolve => setTimeout(resolve, 3000))
      })
      .then((p)=> {
        return _page.property('content')
      })
      .then((content)=> {
        console.log('loading list')
        var $ = cheerio.load(content)
    	
        var data = $('#If_11 > tbody > tr > td')
        for (var i = 0; i < data.length; i+=12) {
          countt++;
          var borrow_time = $(data[i + 8]).text().trim()
          var location = "新北市立圖書館 " + $(data[i + 3]).text().trim()
          var renew_count = $(data[i + 10]).text().trim()
          var title = $(data[i + 2]).text().trim()
          var search_book_number = $(data[i + 6]).text().trim()
    
          var json = {
              "borrow_time": borrow_time,
              "location": location,
              "renew_count": renew_count,
              "title": title,
              "search_book_number": search_book_number
          }
          /////////////////////////////////////////////////////
          admin.database().ref('/user_data/'+uid+'/borrow_book/list').update({[countt]:json});
          /////////////////////////////////////////////////////
        }
        return new Promise(resolve => setTimeout(resolve, 3000))
      })
      .then((p)=> {
        return _page.open('http://webpac.tphcc.gov.tw/toread/opac/patron_transactions?t=history')
      })
      .then((p)=> {
        return new Promise(resolve => setTimeout(resolve, 2000))
      })
      .then((p)=> {
        return _page.property('content')
      })
      .then((content)=> {
        //console.log('loading history')
        var $ = cheerio.load(content)
    
        var data = $('.items_tbl_wrap > div > div:nth-child(2) > table > tbody > tr > td')
        for (var i = 0; i < data.length; i+=9) {
          countt++;
          var borrow_time = $(data[i + 6]).text().trim()
          var location = "新北市立圖書館 " + $(data[i + 3]).text().trim()
          var title = $(data[i + 1]).text().trim()
          var search_book_number = $(data[i + 5]).text().trim()
    
          var json = {
              "borrow_time": borrow_time,
              "location": location,
              "title": title,
              "search_book_number": search_book_number
          }
          /////////////////////////////////////////////////////
          admin.database().ref('/user_data/'+uid+'/borrow_book/list').update({[countt]:json});
          /////////////////////////////////////////////////////
        }
        return new Promise(resolve => setTimeout(resolve, 1000))
      })
      .then((p)=> {
        const off = _page.off('onLoadFinished');
        return Promise.all([off])
      })
      .then(()=> {
        event.data.ref.parent.child('ntc_State').set('Finish')
        instance.exit()
      })
      .catch(e => {
        console.log(username+"login Failed! " + e)
        const off = _page.off('onLoadFinished');
        return Promise.all([off]).then(()=>{
          event.data.ref.parent.child('ntc_State').set('Error')
          instance.exit()
        })
      });

      return Promise.all([pr]).then(()=>{
        return event.data.ref.parent.child('trigger').remove()
      })
    })
})

exports.tc_list = functions.database.ref('/user_data/{userId}/borrow_book/trigger')
.onCreate(event =>{
    
	event.data.ref.parent.child('tc_State').set('initialize')
	const uid = event.params.userId;
	const pr1 = admin.database().ref('/user_data/'+uid+'/library_account/tc_lib/account').once('value');
    const pr2 = admin.database().ref('/user_data/'+uid+'/library_account/tc_lib/password').once('value');
	var countt = 20;
	console.log("start fetching username and password from "+uid+"....")
	var instance, _page;
	return Promise.all([pr1,pr2]).then(results =>{
		event.data.ref.parent.child('tc_State').set('pending')
		console.log("fetching success!")
		const username = results[0].val()
		const password = results[1].val()
		console.log("user is "+username);
		const pr = 
		  phantom
		  .create()
      .then(ph => {
        instance = ph;
        return instance.createPage();
      })
      .then(page => {
        _page = page;
        _page.setting('userAgent', "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36")
        _page.on('onConsoleMessage', true, function(msg) {
            console.log(msg)
        })
        return _page.open('http://book.tpml.edu.tw/webpac/webpacIndex.jsp');
      })
      .then(status => {
        return new Promise(function (resolve, reject) {
          _page.on('onAlert', function (msg) {
            reject(msg)
          })
          _page.on('onLoadFinished', function (status) {
            resolve(status)
          })
          _page.evaluate(function (name, pass) {
            
            document.querySelector("form[name='memberlogin']").autocomplete = "on";
            document.querySelector("input[name='account2']").value = name;
            document.querySelector("input[name='passwd2']").value = pass;
            document.querySelector("form[name='memberlogin']").submit();
            
          },username,password)
        })
      })
      .then((p)=> {
        console.log(username+": log success!")
        return _page.open('http://book.tpml.edu.tw/webpac/personalization/MyLendList1.jsp');
      })
      .then((p)=> {
        return new Promise(resolve => setTimeout(resolve, 5000))
      })
      .then((p)=> {
        return _page.property('content')
      })
      .then((content)=> {
        //console.log('loading list')
        var $ = cheerio.load(content)
    
        var data = $('#lendlist > tbody > tr > td')
        for (var i = 0; i < data.length; i+=9) {
        	countt++;
          var author = $(data[i + 6]).text().trim()
          var borrow_time = $(data[i + 7]).text().trim()
          var location = "臺北市立圖書館"
          var renew_count = $(data[i + 3]).text().trim()
          var title = $(data[i + 5]).text().trim()
          var search_book_number = $(data[i + 4]).text().trim()
    
          var json = {
              "author": author,
              "borrow_time": borrow_time,
              "location": location,
              "renew_count": renew_count,
              "title": title,
              "search_book_number": search_book_number
          }
          /////////////////////////////////////////////////////
          admin.database().ref('/user_data/'+uid+'/borrow_book/list').update({[countt]:json});
          //console.log(json);
          //console.log('\n')
          /////////////////////////////////////////////////////
        }
        return new Promise(resolve => setTimeout(resolve, 1000))
      })
      .then((p)=> {
        return _page.open('http://book.tpml.edu.tw/webpac/personalization/MyLendHistory.do');
      })
      .then((p)=> {
        return new Promise(resolve => setTimeout(resolve, 5000))
      })
      .then((p)=> {
        return _page.property('content')
      })
      .then((content)=> {
        //console.log('loading history')
        var $ = cheerio.load(content)
    
        var data = $('.tablesorter > tbody > tr > td')
        for (var i = 0; i < data.length; i+=6) {
        	countt++;
          var author = $(data[i + 3]).text().split(' / ')[1].trim()
          var borrow_time = $(data[i + 4]).text().trim()
          var location = "臺北市立圖書館 " + $(data[i + 5]).text().trim()
          var title = $(data[i + 3]).text().split(' / ')[0].trim()
          var search_book_number = $(data[i + 2]).text().trim()
    
          var json = {
              "author": author,
              "borrow_time": borrow_time,
              "location": location,
              "title": title,
              "search_book_number": search_book_number
          }
          /////////////////////////////////////////////////////
          admin.database().ref('/user_data/'+uid+'/borrow_book/list').update({[countt]:json});
          //console.log(json);
          //console.log('\n')
          /////////////////////////////////////////////////////
        }
        return new Promise(resolve => setTimeout(resolve, 1000))
      })
      .then((p)=> {
        const off = _page.off('onLoadFinished');
        return Promise.all([off])
      })
      .then(()=> {
        event.data.ref.parent.child('tc_State').set('Finish')
        instance.exit()
      })
      .catch(e => {
        console.log(username+"login Failed! " + e)
        const off = _page.off('onLoadFinished');
        return Promise.all([off]).then(()=>{
          event.data.ref.parent.child('tc_State').set('Error')
          instance.exit()
        })
      });

      return Promise.all([pr]).then(()=>{
        return event.data.ref.parent.child('trigger').remove()
      })
    })
})