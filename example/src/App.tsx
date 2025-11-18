import { useState, useEffect } from 'react';
import { View, Button, Text, ActivityIndicator, Linking } from 'react-native';
import { Softphone } from 'react-native-softphone-sdk';

const FREJUN_CREDENTIALS = {
  clientId: 'e8zICiydoDgPSlI9JHsJDKEYnhH7lBapJKGurQ9h',
  clientSecret: 'pbkdf2_sha256$600000$0XXsGeDFe9kGDVqGTIdnnt$N3dK+aDScMJSoB/q1MXDcTmd5IQ4kt2nvbRoX/nvAY8=',
};

const App = () => {
  const [softphone, setSoftphone] = useState<Softphone | null>(null);
  const [isLoading, setIsLoading] = useState(true);
//   const [callState, setCallState] = useState('Idle');
//   const [activeSession, setActiveSession] = useState(null);
  
  useEffect(() => {
      // --- This is now the single point of SDK configuration ---
      const initializeSdk = async () => {
          try {
              // Initialize with credentials and see if a session can be restored.
              const restoredSoftphone = await Softphone.initialize(FREJUN_CREDENTIALS);
              if (restoredSoftphone) {
                  setSoftphone(restoredSoftphone);
              }
          } catch (error) {
              console.error("SDK Initialization failed:", error);
              // You might want to show an error state to the user
          } finally {
              setIsLoading(false);
          }
      };

      initializeSdk();
      
      // --- The deep link handler no longer needs credentials ---
      const deepLinkSub = Linking.addEventListener('url', async (event) => {
        console.log("Deep link received:", event.url);
          if (event.url.includes('?code=')) {
              setIsLoading(true);
              console.log("Handling redirect for login...");
              try {
                  // handleRedirect now knows the credentials from the initialize step.
                  const newSoftphone = await Softphone.handleRedirect(event.url);
                  console.log("Login successful, Softphone instance obtained.");
                  setSoftphone(newSoftphone);
              } catch (error) {
                  console.error("Login failed during redirect:", error);
              } finally {
                  setIsLoading(false);
              }
          }
      });

      return () => deepLinkSub.remove();
    }, []);

    useEffect(() => {
        if (softphone) {

            const listeners = {
                onConnectionStateChange: (type:any, state:any, isError:any, error:any) => {
                    console.log(`Connection State Change: ${type} - ${state} - Error: ${isError ? 'Yes' : 'No'} - ${error ? error : ''}`);
                    // if (isError) console.error('Connection Error:', error);
                },
                onCallCreated: (type:any, details:any) => {
                    console.log(`Call Created: ${type} to ${details.candidate}`);
                    // setCallState(`Call created (${type})`);
                    // setActiveSession(softphone.getSession());
                },
                onCallAnswered: (session:any) => {
                    console.log('Call Answered',session);
                    // setCallState('Established');
                },
                onCallHangup: (session:any) => {
                    console.log('Call Hung up',session);
                    // setCallState('Idle');
                    // setActiveSession(null);
                }
            };

            softphone.start(listeners).catch(error => {
                console.error("Failed to start softphone:", error);
                handleLogout();
            });
        }
    },[softphone]);

  // --- login() is now simpler ---
  const handleLogin = async () => {
      try {
          await Softphone.login();
      } catch(error) {
          console.error(error); // This will catch the error if initialize was never called
      }
  };

  const handleLogout = async () => {
      if (softphone) {
          await softphone.logout();
          setSoftphone(null);
      }
  };

  if (isLoading) {
      return <ActivityIndicator size="large" />;
  }

  return (
      <View
      style={{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: '#f5f5f5'
      }}
      >
          {softphone ? (
              <>
                  <Text>Welcome! You are logged in.</Text>
                  <Button title="Make a Test Call" onPress={() => {
                      softphone.makeCall('+916361710745','+918645328392')
                  }} />
                  <Button title="Logout" onPress={handleLogout} />
              </>
          ) : (
              <Button title="Login with FreJun" onPress={handleLogin} />
          )}
      </View>
  );
};

export default App;