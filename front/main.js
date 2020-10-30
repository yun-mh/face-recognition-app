let app = new Vue({
  el: '#app',
  data: {
    isVideoSet: false,
    isLoading: true,
    isStarted: false,
    video: '',
    canvas: '',
    chart: '',
    emotions: '',
    result: '',
  },
  mounted () {
    // コンポーネントがDOMにマウントされた時に映像とチャートを生成する
    this.createVideo();
    this.createChart();
  },
  methods: {
    // ウェブカメラを用いてvideoタグに映像を映す
    createVideo: function() {
      this.video = this.$refs.video;
      if (window.navigator.mediaDevices && window.navigator.mediaDevices.getUserMedia) {
        window.navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
          this.video.srcObject = stream;
        }).then(_ => {
          this.isVideoSet = true;
          this.updateVideo();
        })
      }
    },
    // 映像のためのキャンバスをアップデートするためのメソッド
    updateVideo: function () {
      this.canvas = this.$refs.canvas;
      this.imageCanvas = this.$refs.imageCanvas; // 表情解析する時に実際対象になるイメージのためのcanvas
      
      // 各種canvasタグのコンテキスト及びサイズの取得
      const ctx = this.canvas.getContext("2d");
      const imgCtx = this.imageCanvas.getContext("2d");
      const imageWidth = this.canvas.width;
      const imageHeight = this.canvas.height;
      
      // 一度描画した枠線をクリアする
      ctx.clearRect(0, 0, 640, 480);
      
      // videoタグの映像データをイメージ化し、そのイメージをimageCanvasに動画のように描画する
      imgCtx.drawImage(this.video, 0, 0, 100, 75);
      requestAnimationFrame(this.updateVideo);
      
      // 開始ボタンが押されているかつレスポンスの結果が存在している場合、枠線を描画する
      if (this.isStarted === true && this.isLoading === false && this.result !== '') {
        this.drawFrame(ctx, imageWidth, imageHeight, this.result);
        // マスクのデータが存在したらマスクの枠線を描画する
        if (this.result.Mask !== false) {
          this.drawFrame(ctx, imageWidth, imageHeight, this.result.Mask);
        }
        // スマイルのデータが存在したら映像にフィルター効果を付与する
        if (this.result.Smile.Value === true) {
          this.filterVideo(ctx, imageWidth, imageHeight);
        }
      }
    },
    // 開始・終了ボタンの処理
    controlVideo: function () {
      let timeout;
      if (this.isStarted) {
        // 開始の間には再帰的にこの関数が呼び出され、周期的にapiにリクエストを送る
        this.analyzeImage();
        timeout = window.setTimeout(this.controlVideo, 500);
      } else {
        clearTimeout(timeout);
        this.result = '';
      }
    },
    // imageCanvasのイメージをrekognition apiにアップロードし解析するメソッド
    analyzeImage: function () {
      // axiosのconfig設定
      let config = {
        headers: {
          'content-type': 'application/octet-stream',
        }
      };
      
      // apiにイメージをポストする
      axios
        .post(
          "https://07x2mwjo9j.execute-api.ap-northeast-1.amazonaws.com/api/rekognition",
          this.imageCanvas.toDataURL(),
          config
        )
        .then(response => {
          try {
            this.result = response.data; // レスポンスを結果として扱う
            this.emotions = this.extractEmotions(this.result); // 結果から感情を抽出し感情として設定する
            this.isLoading = false; // 結果が存在するため、ローディングをfalseに設定する
          } catch (e) {
            // apiで解析失敗になったレスポンスが返ってきた場合、結果を空でローディングフラグをtrueにする
            this.result = '';
            this.isLoading = true;
          }
        })
        .then(_ => {
          this.updateChart(); // 取得した結果に基づいてチャートをアップデートする
        })
        .catch(error => {
          console.log(error);
        });
    },
    // 顔とマスクの枠線を描画するメソッド
    drawFrame: function(ctx, imageWidth, imageHeight, target) {
      // 枠線の描画のためのプロパティ設定
      ctx.lineWidth = 3;
      ctx.font = '18px san-serif';
      ctx.fillStyle = "#0000FF";
      
      // 各枠線のタイトルやボックス・線の色を設定するための処理
      let title, strokeStyle;
      if (target === this.result) {
        title = "顔";
        ctx.fillStyle = "#19D9FD";
        strokeStyle = "#19D9FD";
      } else {
        title = "マスク";
        ctx.fillStyle = "#00FF00";
        strokeStyle = "#00FF00";
      }

      // 枠線の位置を結果から取得し、枠線の座標及びサイズを算出する
      const { BoundingBox: { Height, Left, Top, Width } } = target;
      const top = Top * imageHeight;
      const height = Height * imageHeight;
      const left = Left * imageWidth;
      const width = Width * imageWidth;
      
      // 枠線のタイトルボックスを描画する
      ctx.filter = "opacity(75%)"
      ctx.strokeStyle = strokeStyle;
      ctx.fillRect(left, top, 75, 28);
      
      // 枠線を描画する
      ctx.fillStyle = "#FFFFFF"
      ctx.fillText(title, left + 10, top + 20);
      ctx.strokeRect(left, top, width, height);
      
      // 結果にマスクの情報が含まれていた場合、マスクの枠線を描画する
      if (target === this.result.Mask) {
        ctx.fillStyle = "#FF0000";
        ctx.font = 'bold 22px san-serif';
        ctx.fillText("より精度を高くするためには、マスクを外してください。", 10, 30);
      }
    },
    // 笑う際のvideoフィルター演出メソッド
    filterVideo: function(ctx, imageWidth, imageHeight) {
      // 放射状のグラデーション設定
      const gradient = ctx.createRadialGradient(imageWidth / 2, imageHeight / 2, 0, imageWidth / 2, imageHeight / 2, imageWidth * 0.6);
      gradient.addColorStop(0, "#C6FFDD");
      gradient.addColorStop(0.5, "#FBD786");
      gradient.addColorStop(1, "#f7797d");
      
      // canvasにグラデーションを適用する  
      ctx.fillStyle = gradient;
      ctx.filter = "opacity(40%)";
      ctx.fillRect(0, 0, imageWidth, imageHeight);
    },
    // 結果から感情データを取り出すメソッド
    extractEmotions: function(result) {
      const { Emotions } = result;
      const calm = Emotions.find(emotion => emotion.Type === "CALM");
      const happy = Emotions.find(emotion => emotion.Type === "HAPPY");
      const surprised = Emotions.find(emotion => emotion.Type === "SURPRISED");
      const sad = Emotions.find(emotion => emotion.Type === "SAD");
      const fear = Emotions.find(emotion => emotion.Type === "FEAR");
      const angry = Emotions.find(emotion => emotion.Type === "ANGRY");
      const confused = Emotions.find(emotion => emotion.Type === "CONFUSED");
      const disgusted = Emotions.find(emotion => emotion.Type === "DISGUSTED");
        
      return { calm, happy, surprised, sad, fear, angry, confused, disgusted }; 
    },
    // チャートを生成するメソッド
    createChart: function() {
      const config = {
        type: 'doughnut',
        data: {
          labels: ['穏やか', '幸せ', '驚き', '悲しさ', '恐怖', '怒り', '混乱', '嫌悪'],
          datasets: [{
            backgroundColor: ['#4fd1c5', '#68d391', '#f6e05e', '#63b3ed', '#b794f4', '#fc8181', '#f687b3', '#cbd5e0'],
            data: []
          }]
        },
        options: {
          legend: {
            display: false
          },
          responsive: false,
        }
      };
      const chart = new Chart(document.getElementById('chart').getContext('2d'), config);
      this.chart = chart;
    },
    // チャートをアップデートするメソッド
    updateChart: function() {
      // 抽出した感情が空でなければチャートをアップデートする
      if (this.emotions !== '') {
        this.chart.config.data.datasets[0].data = [this.emotions.calm.Confidence, this.emotions.happy.Confidence, this.emotions.surprised.Confidence, this.emotions.sad.Confidence, this.emotions.fear.Confidence, this.emotions.angry.Confidence, this.emotions.confused.Confidence, this.emotions.disgusted.Confidence];
        this.chart.update();
      }
    },
  }
})