import React, { Component } from 'react';
import styles from './App.module.css';
import { ethers, Wallet } from 'ethers';
import Web3Provider from 'web3-react';
import { Connectors } from 'web3-react';
import Connect from './Components/Connect/Connect.jsx';
import contracts from './Contracts';
import CreateSpace from './Components/CreateSpace/CreateSpace';
import AddToWhitelist from './Components/AddToWhitelist/AddToWhitelist';
import Spinner from './Components/ImageUploads/Spinner/Spinner';
import Images from './Components/ImageUploads/Images/Images';
import Buttons from './Components/ImageUploads/Buttons/Buttons';
import BoxStore from './Components/BoxStore/BoxStore';
import EthCrypto from 'eth-crypto';
import Box from '3box';
import RegisterButton from './Components/RegisterWorkspace/RegisterButton/RegisterButton'
import {CopyToClipboard} from 'react-copy-to-clipboard';
import SecretCommand from './Components/RegisterWorkspace/SecretCommand/SecretCommand';



class App extends Component{

  state = {
    context: null,
    contextFlag: false,
    spaceId: null,
    whitelistAddress: null,
    uploading: false,
    images: [],
    registering: false,
    userSecretCode: null,
    copiedText: null,
    copied: null,
    copiedFlag: null,
    timestamp: null
  }

  connectHandler = () => {
    this.setState({contextFlag: true})
  }

  createSpaceHandler = async (context) => {
    console.log(context.account)
    let accessControlContract = new ethers.Contract(contracts.accessControls.address, contracts.accessControls.ABI, context.library.getSigner())
    await accessControlContract.createSpace();
    accessControlContract.once('newSpaceCreated', res => {
      this.setState({spaceId: res.toNumber()})
      })
  }

  spaceIdChangeHandler = (event) => {
    this.setState({spaceId: event.target.value});
  }

  whitelistAddressChangeHandler = (event) => {
    this.setState({whitelistAddress: event.target.value});
  }

  addToWhitelistClickHandler = async (context) => {
    let accessControlContract = new ethers.Contract(contracts.accessControls.address, contracts.accessControls.ABI, context.library.getSigner());
    console.log(this.state.whitelistAddress)
    console.log(this.state.spaceId)
    
    await accessControlContract.addToWhiteList(this.state.whitelistAddress, this.state.spaceId);
    accessControlContract.once('spaceMemberAdded', res => {
      this.setState({spaceMemberAdded: res.toNumber()});
      console.log(res.toString());
      })
    accessControlContract.once('whitelisted', res => {
      this.setState({newSpaceMemberAdded: res.toString()})
      console.log(res.toString());
    })
  }

  encodeImageFileAsUrl = (file) => {
    let reader = new FileReader();
    reader.onloadend = async function() {
      let res = await EthCrypto.encryptWithPublicKey('49abc6fcf7d0783249febba656122e4dd8329e88502b7f3fc1803829f651c44b87774aefaefb72197ec19cbbf5747a74895c2784f6765f543a655789b1c41fff', reader.result)
      return res;
    }
    reader.readAsDataURL(file);
  }


  fileUploadHandler = context => async e => {
    const files = Array.from(e.target.files);

    // this.setState({uploading: true});
    const publicKey = 'a4cdd31d8e9e68874cdc7feea0fafea52d10f01416e562c61a5e4ae5ad736939963aca9318446f593366db5058d0d6e1385f46eaf5c0a71dfc0f482cb1681492';

    //will need to convert to FormData object once decrypted server-side.
    //unfortunately, cannot directly encrypt FormData object client-side
    let encryptedFiles = [];
    await files.forEach(async (file, i) => {
      let reader = new FileReader();
      reader.onloadend = async () => {
        let encryptedFile = await EthCrypto.encryptWithPublicKey(publicKey, reader.result);
        encryptedFiles.push(encryptedFile);
      }
      reader.readAsDataURL(file);
    })

      // let msg = [i, file];

    let box = await Box.openBox(context.account, window.ethereum);
    box.onSyncDone(async () => {
      const workSpace = await box.openSpace(contracts.accessControls.address.toString() + this.state.spaceId.toString());
      let temp = await workSpace.public.get('files');
      if (temp === undefined){
        temp = [];
      }
      let newEncryptedFiles = temp.concat(encryptedFiles);
      await workSpace.public.set('files', newEncryptedFiles);
    })
  }

  removeImageHandler = async (id) => {
    this.setState({
      images: this.state.images.filter(image => image.public_id !== id)
    })
  }

  boxHandler = async (context) => {
    // console.log(context.account);
    let box = await Box.openBox(context.account, window.ethereum);
    box.onSyncDone(async () => {
      const workSpace = await box.openSpace(contracts.accessControls.address.toString() + this.state.spaceId.toString());
      let x = await workSpace.public.get('files');
      console.log(x);
    })



  }
  newContextHandler = async (context) => {
    this.setState({context: context})
  }

  registerSlackWorkspaceHandler = async (context) => {

    let accessControlContract = new ethers.Contract(contracts.accessControls.address, contracts.accessControls.ABI, context.library.getSigner());

    let indexOfUser = await accessControlContract.getUserIndexInWhitelist(context.account, this.state.spaceId);
    console.log(indexOfUser);
      
    await accessControlContract.commitSignatureTime(indexOfUser, this.state.spaceId);
    this.setState({registering: true});
  }

  revealSecretCommandHandler = async (context, web3) => {
    let accessControlContract = new ethers.Contract(contracts.accessControls.address, contracts.accessControls.ABI, context.library.getSigner());
    let timestamp = await (accessControlContract.getTimestamp(this.state.spaceId, context.account));
    this.setState({timestamp: timestamp});
    console.log(timestamp);

    let msg = await web3.utils.soliditySha3(
      '0x19', 
      '0x00', 
      contracts.accessControls.address, 
      'Generate authorization code', 
      this.state.spaceId,
      timestamp
    );

    

    web3.eth.personal.sign(msg, context.account, (err, res) => {
      if(err){
        console.log(err);
      } else{
        this.setState({userSecretCode: "register " + this.state.spaceId + 'xx' + timestamp + context.account + res});
        console.log(this.state.userSecretCode)
      }
    });
  }

  render(){

    const {InjectedConnector} = Connectors;
    const MetaMask = new InjectedConnector({ supportedNetworks: [ 4 ] });

    const connectors = {MetaMask};

    let spaceRender;
    let registeringMessage;
    let secretCommand;

    const {uploading, images} = this.state;

    let imageContent = (context) => {
      switch (true){
        case uploading:
          return <Spinner />
        case images.length >0:
          return(
            <Images 
              images={images}
              removeImage={this.removeImageHandler}
            />
          )
        default: return <Buttons addImage={this.fileUploadHandler}/>
      }
    }

    if(this.state.spaceId !== null){
      spaceRender = <p>Your Space ID is {this.state.spaceId}</p>;
    }
    if (this.state.registering === true){
      registeringMessage = <div>
        <p
          className={styles.PMessage}
        >Your secret command is below. Send this command as a direct message to funfacebot in your slack channel to register your dataspace.</p>
        <br/>
        <p>Click in box to copy </p>
        <CopyToClipboard 
          text={this.state.userSecretCode}
          onCopy={() => this.setState({copied: true, copiedFlag: true})}
        >
        <p
          className={styles.SecretCode}
        >{this.state.userSecretCode}</p>
        </CopyToClipboard>
      </div>

  }

    if(this.state.registering){
      secretCommand = <SecretCommand
        clicked={this.revealSecretCommandHandler}
      />
    }

    if(this.state.copiedFlag === true){
      setTimeout( () => {
        this.setState({copiedFlag: false})
      }, 5000);
    }
    let copiedText;
    if(this.state.copiedFlag === true){
      copiedText = <p>Copied!</p>
    }

    if (this.state.contextFlag === false){
      return(
        <Web3Provider
        connectors = {connectors}
        libraryName={'ethers.js'}
        >
          <Connect
            clicked={this.connectHandler}
            connection={connectors}
          />
        </Web3Provider>
      )
    }

    else {
      return (
        <Web3Provider
          connectors={connectors}
          libraryName={'ethers.js'}
          >
          <div
          className={styles.background}>
            <CreateSpace
              clicked={this.createSpaceHandler}
            />
            <RegisterButton
              clicked={this.registerSlackWorkspaceHandler}
            />
            <br/>
            {secretCommand}
            <br/>
            {spaceRender}
            <br/>
            <br/>
            {registeringMessage}
            {copiedText}
            <br/>
            <AddToWhitelist
              spaceIdChanged={this.spaceIdChangeHandler}
              whitelistAddressChanged={this.whitelistAddressChangeHandler}
              clicked={this.addToWhitelistClickHandler}
            />
            <br/>
            <br/>
            {imageContent()}
            <br/>
            <br/>
          <BoxStore
            clicked={this.boxHandler}
          />
          </div>
      </Web3Provider>



      );
    }
  }
}

export default App;
