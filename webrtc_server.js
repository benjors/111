//require our websocket library
var WebSocketServer = require('ws').Server;
var author = require('./author/authorization');
var db = require('./mysql/mysql');
const mysql = require('mysql');

//creating a websocket server at port 9090
var wss = new WebSocketServer({port: 9090});

//all connected to the server users
var users = {};

//when a user connects to our sever
wss.on('connection', function (connection) {

    console.log("User connected");

    //when server gets a message from a connected user
    connection.on('message', function (message) {

        var data;
        //accepting only JSON messages
        try {
            data = JSON.parse(message);
            console.log('收到数据：', data);
        } catch (e) {
            console.log("Invalid JSON");
            data = {};
        }

        //switching type of the user message
        switch (data.type) {
            //when a user tries to login
            case "login":
                // console.log("User logged", data.user_name,mysql.escape(data.user_name));
                var containSpecial = RegExp(/[(\ )(\~)(\!)(\@)(\#)(\$)(\%)(\^)(\&)(\*)(\()(\))(\-)(\_)(\+)(\=)(\[)(\])(\{)(\})(\|)(\\)(\;)(\:)(\')(\")(\,)(\.)(\/)(\<)(\>)(\?)(\)]+/);
                if (containSpecial.test(data.user_name)) {//过滤字符 和检测 特殊字符
                    return sendTo(connection, {
                        type: "login", success: false, message: '登录失败，用户名不能包含特殊字符，请重试'
                    });
                };

                //if anyone is logged in with this username then refuse
                db.query( `select id,user_name,nick_name,password,created_at,enable from users where user_name ='${data.user_name}' and password ='${data.password}'`, [], function (result, fields) {
                    console.log('查询结果--：', result);
                    if (result.length > 0) {
                        console.log('查询结果--：', result[0].user_name, result[0].password);
                        const token = author.generateToken({
                            user_name:  data.user_name,
                            password:  data.password,
                        });

                        sendTo(connection, {
                            type: "login",
                            success: true,
                            token: token,
                            data:{
                                id: result[0].id,
                                user_name:result[0].user_name,
                                nick_name: result[0].nick_name,
                                created_at: result[0].created_at,
                                enable:result[0].enable.lastIndexOf(0)!==-1 ? 0 : 1,
                            },
                        });

                    } else {
                        sendTo(connection, {
                            type: "login", success: false, message: '登录失败，登录信息错误，请重试'
                        });
                    }
                });
                break;

            case "regist":
                console.log("User regist", data.user_name);
                //if anyone is logged in with this username then refuse
                var containSpecial = RegExp(/[(\ )(\~)(\!)(\@)(\#)(\$)(\%)(\^)(\&)(\*)(\()(\))(\-)(\_)(\+)(\=)(\[)(\])(\{)(\})(\|)(\\)(\;)(\:)(\')(\")(\,)(\.)(\/)(\<)(\>)(\?)(\)]+/);
                if (containSpecial.test(data.user_name)) {//过滤字符 和检测 特殊字符
                    return sendTo(connection, {
                        type: "login", success: false, message: '注册失败，用户名不能包含特殊字符，请重试'
                    });
                };

                db.query(`select user_name from users where user_name = '${data.user_name}'`, [], function (result, fields) {
                    console.log('查询结果：', result.length);

                    if (result.length > 0) {
                        sendTo(connection, {
                            type: "regist", success: false, message: '请换一个用户名试试'
                        });
                    } else {
                        //save user connection on the server
                        var addSql = 'INSERT INTO users(user_name,password,created_at,enable) VALUES(?,?,?,?)';
                        var addSqlParams = [
                            data.user_name,
                            data.password,
                            data.created_at,
                            0
                        ];
                        db.query(addSql, addSqlParams, function (result, fields) {
                            console.log('添加成功')
                            sendTo(connection, {
                                type: "regist", success: true,
                            });
                        })
                    }

                });

                break;

            case "user_list":
                // console.log("User logged", data.user_name,mysql.escape(data.user_name));
                var containSpecial = RegExp(/[(\ )(\~)(\!)(\@)(\#)(\$)(\%)(\^)(\&)(\*)(\()(\))(\-)(\_)(\+)(\=)(\[)(\])(\{)(\})(\|)(\\)(\;)(\:)(\')(\")(\,)(\.)(\/)(\<)(\>)(\?)(\)]+/);
                if (containSpecial.test(data.id)) {//过滤字符 和检测 特殊字符
                    return sendTo(connection, {
                        type: "login", success: false, message: '查询失败，用户名不能包含特殊字符，请重试'
                    });
                };

                 author.verifyToken(data.token).then(( Result)=>{
                     console.log(1232132,Result);
                     db.query( `select * from Friend where user_id=${data.id}`, [], function (result, fields) {
                         console.log('好友列表查询结果--：', result);
                         if (result) {
                             console.log('查询结果--：', result);
                             sendTo(connection, {
                                 type: "user_list",
                                 success: true,
                                 data:result,
                             });
                         }
                     });
                 }).catch(( Error)=>{
                     console.log(Error)
                     sendTo(connection, {
                         type: "user_list",
                         success: false,
                         data:{message:"登录失败，token错误"},
                     });
                 });
                break;

            case "offer":
                //for ex. UserA wants to call UserB
                console.log("Sending offer to: ", data.user_name);

                //if UserB exists then send him offer details
                var conn = users[data.user_name];

                if (conn != null) {
                    //setting that UserA connected with UserB
                    connection.otherName = data.user_name;

                    sendTo(conn, {
                        type: "offer", offer: data.offer, user_name: connection.name
                    });
                }

                break;

            case "answer":
                console.log("Sending answer to: ", data.user_name);
                //for ex. UserB answers UserA
                var conn = users[data.user_name];

                if (conn != null) {
                    connection.otherName = data.name;
                    sendTo(conn, {
                        type: "answer", answer: data.answer
                    });
                }

                break;

            case "candidate":
                console.log("Sending candidate to:", data.user_name);
                var conn = users[data.user_name];

                if (conn != null) {
                    sendTo(conn, {
                        type: "candidate", candidate: data.candidate
                    });
                }

                break;

            default:
                sendTo(connection, {
                    type: "error", message: "Command not found: " + data.type
                });

                break;

        }
    });

    //when user exits, for example closes a browser window
    //this may help if we are still in "offer","answer" or "candidate" state
    connection.on("close", function () {

        if (connection.user_name) {
            delete users[connection.user_name];

            if (connection.otherName) {
                console.log("Disconnecting from ", connection.otherName);
                var conn = users[connection.otherName];
                conn.otherName = null;

                if (conn != null) {
                    sendTo(conn, {
                        type: "leave"
                    });
                }
            }
        }
    });

    connection.send("Hello world");

});

function sendTo(connection, message) {
    connection.send(JSON.stringify(message));
}
