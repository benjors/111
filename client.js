console.log('启动');
var script = document.createElement('script');
script.type = 'text/javascript';
script.src = 'https://cdn.jsdelivr.net/npm/vue@2';
script.onload = script.onreadystatechange = function (result) {
    if (!this.readyState || this.readyState == 'loaded' || this.readyState == 'complete') {
        render();
        script.onload = script.onreadystatechange = null;
    }
}
document.body.appendChild(script);

var user_name;
var connectedUser;
var yourConn;
var dataChannel;

/****
 * UI selectors block
 ****/
var usernameInput = document.querySelector('#usernameInput');
var passwordInput = document.querySelector('#passwordInput');
var passwordInput2 = document.querySelector('#passwordInput2');
var registBtn = document.querySelector('#registBtn');

var callToUsernameInput = document.querySelector('#callToUsernameInput');
var callBtn = document.querySelector('#callBtn');

var msgInput = document.querySelector('#msgInput');
var sendMsgBtn = document.querySelector('#sendMsgBtn');

var chatArea = document.querySelector('#chatarea');

render = () => {
    console.log('加载完成', Vue);

    var app = new Vue({
        el: '#imgb',
        data: {
            vue_message: 'Hello Vue!',
            conn: null,//soket connection object for connection
            user_name:'12132',
            password:'',
            loginPageshow: true,//是否显示登录页面
        },
        watch: {
            user_name(newval,oldval){
                console.log(1232,newval,oldval);
            },
            password(newval,oldval){
                console.log(1232,newval,oldval);
            }
        },
        mounted: function () {
            var imgb = document.querySelector('#imgb');
            imgb.style.display = 'block';
            this.launch_socket();
            let token = localStorage.getItem('token');
            if (token) this.loginPageshow = false;
        },
        methods: {
            changeText: function (event) {
                this.vue_message = "Hello Vue Click!"
               this.loginPageshow=!this.loginPageshow;
            },
            /****
             * 启动socket
             * */
            launch_socket: function(){
                this.conn = new WebSocket('ws://localhost:9090');

                this.conn.onopen = function () {
                    console.log("Connected to the signaling server");
                };

                this.conn.onmessage = (msg)=> {
                    console.log("Got message", msg.data);
                    try {
                        var data = JSON.parse(msg.data);
                    } catch (err) {
                        return console.log('Error: ', err.message);
                    }

                    switch (data.type) {
                        case "login":
                            //set the token and user  to the localStorage
                            localStorage.setItem('token', data.token);
                            localStorage.setItem('user', JSON.stringify(data.data));
                            this.handleLogin(data);
                            break;
                        case "regist":
                            this.handleRegistration(data);
                            break;
                        case "user_list":
                            //set the token and user  to the localStorage
                            if (data.success) {
                                localStorage.setItem('user_list', JSON.stringify(data.data));
                            } else {
                                localStorage.clear()
                                alert('登录信息错误，请重新登录');
                            }
                            break;
                        //when somebody wants to call us
                        case "offer":
                            this.handleOffer(data.offer, data.user_name);
                            break;
                        case "answer":
                            this.handleAnswer(data.answer);
                            break;
                        //when a remote peer sends an ice candidate to us
                        case "candidate":
                            this.handleCandidate(data.candidate);
                            break;
                        default:
                            break;
                    }
                };

                this.conn.onerror = function (err) {
                    console.log("Got error", err);
                };

            },
            /****
             * 无权限发送消息
             * */
            send: function(message){
                console.log("Sent message", message)
                //attach the other peer username to our messages
                if (connectedUser) {
                    message.user_name = connectedUser;
                }

                this.conn.send(JSON.stringify(message));
            },
            /****
             * 带有权限的发消息
             * */
            auth_send: function (message){
                var user = localStorage.getItem("user")
                let token = localStorage.getItem('token');
                user = JSON.parse(user);
                if (!token && !user) {
                    return alert("没有登录，请登录")
                } else {
                    message.user_name = connectedUser;
                    message.token = token;
                    message.id = user.id;
                }

                console.log("auth_send message", message)
                this.conn.send(JSON.stringify(message));
            },
            /****
             * 登录消息监听
             * */
            handleLogin: function(data){
                if (data.success === false) {
                    alert(data.message);
                } else {
                    this.loginPageshow =false
                    //**********************Starting a peer connection//**********************

                    //using Google public stun server
                    var configuration = {
                        "iceServers": [{"url": "stun:stun2.1.google.com:19302"}]
                    };

                    yourConn = new webkitRTCPeerConnection(configuration, {optional: [{RtpDataChannels: true}]});

                    // Setup ice handling
                    yourConn.onicecandidate =  (event)=> {
                        if (event.candidate) {
                            this.send({
                                type: "candidate",
                                candidate: event.candidate
                            });
                        }
                    };

                    //creating data channel
                    dataChannel = yourConn.createDataChannel("channel1", {reliable: true});

                    dataChannel.onerror =  (error)=> {
                        console.log("Ooops...error:", error);
                    };

                    //when we receive a message from the other peer, display it on the screen
                    dataChannel.onmessage =  (event)=> {
                        chatArea.innerHTML += connectedUser + ": " + event.data + "<br />";
                    };

                    dataChannel.onclose =  ()=> {
                        console.log("data channel is closed");
                    };

                    setTimeout(() => {
                        this.auth_send({
                            type: "user_list",
                        });
                    }, 1000)

                }
            },
            /****
             * 注册消息监听
             * */
             handleRegistration: function(data){
                console.log("handleRegistration: ", data)
                if (data.success === false) {
                    alert(data.message);
                } else {
                    location.href = "/helloworld.js/index.html"
                }
            },
            /****
             * 当有人向我们发送报价时 when somebody sends us an offer
             * */
             handleOffer: function(offer, user_name){
                connectedUser = user_name;
                yourConn.setRemoteDescription(new RTCSessionDescription(offer));

                //create an answer to an offer
                yourConn.createAnswer(function (answer) {
                    yourConn.setLocalDescription(answer);
                    send({
                        type: "answer",
                        answer: answer
                    });
                }, function (error) {
                    alert("Error when creating an answer");
                });

             },
            /****
             * 当我们得到远程用户的答复时 when we got an answer from a remote user
             * */
             handleAnswer: function(answer){
                yourConn.setRemoteDescription(new RTCSessionDescription(answer));
             },
            /****
             * 当我们从远程用户那里得到一个候选冰 when we got an ice candidate from a remote user
             */
             handleCandidate: function(candidate){
                yourConn.addIceCandidate(new RTCIceCandidate(candidate));
            },
            /****
             * Login when the user clicks the button
             * */
            loginBtn: function(data){

                console.log("loginBtn", 212,data,app);
                if (this.user_name && this.password.length) {
                    this.send({
                        type: "login",
                        user_name: this.user_name,
                        password: this.password
                    });
                }
            },
            /****
             * Login when the user clicks the button
             */
            registBtn: function(){
                console.log("Register", 212);
                let user_name = usernameInput.value;
                let password = passwordInput.value;
                let password2 = passwordInput2.value;
                if (user_name.length > 0 && password.length > 0 && password2.length > 0 && password2 == password) {
                    this.send({
                        type: "regist",
                        user_name: user_name,
                        password: password,
                        created_at: `${new Date().getTime()}`,
                    });
                }
            },
            /****
             * initiating a call
             * */
            callBtn: function(){
                var callToUsername = callToUsernameInput.value;
                if (callToUsername.length > 0) {
                    connectedUser = callToUsername;
                    // create an offer
                    yourConn.createOffer(function (offer) {
                        this.send({
                            type: "offer",
                            offer: offer
                        });
                        yourConn.setLocalDescription(offer);
                    }, function (error) {
                        alert("Error when creating an offer");
                    });
                }
            },
            /****
             * 当用户单击“发送消息”按钮时  when user clicks the "send message" button
             * */
            sendMsgBtn: function(msg){
                var val = msgInput.value;
                chatArea.innerHTML += user_name + ": " + val + "<br />";
                //sending a message to a connected peer
                dataChannel.send(val);
                msgInput.value = "";
            }

        }
    })
}





